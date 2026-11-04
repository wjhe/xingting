package com.wendao.changsheng;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.tapsdk.tapad.AdRequest;
import com.tapsdk.tapad.TapAdConfig;
import com.tapsdk.tapad.TapAdCustomController;
import com.tapsdk.tapad.TapAdManager;
import com.tapsdk.tapad.TapAdNative;
import com.tapsdk.tapad.TapAdSdk;
import com.tapsdk.tapad.TapInterstitialAd;
import com.tapsdk.tapad.TapRewardVideoAd;
import com.tapsdk.tapad.constants.Constants;

/**
 * TapADN 广告（激励视频、插屏）的桥接。
 * 媒体与广告位 ID 由 build.gradle 从 android-keys/tapad.properties 读入 BuildConfig，不进版本库。
 * 必须在玩家同意隐私政策之后才调用 init（TapADN 合规要求）。
 */
@CapacitorPlugin(name = "TapAd")
public class TapAdPlugin extends Plugin {
    private static final String TAG = "TapAdPlugin";
    /** 广告加载超时：超时按"暂无可用视频"处理，不让玩家干等 */
    private static final long LOAD_TIMEOUT_MS = 8000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private TapAdNative adNative;
    private boolean initialized = false;
    /** 预先加载好的激励视频，看完一条后再加载下一条 */
    private TapRewardVideoAd cachedReward;
    private boolean loadingReward = false;
    /** 正在播放的激励视频：同一时间只放一条 */
    private boolean playing = false;

    private static boolean configured() {
        return BuildConfig.TAPAD_MEDIA_ID > 0 && !BuildConfig.TAPAD_MEDIA_KEY.isEmpty() && BuildConfig.TAPAD_REWARD_SPACE_ID > 0;
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("configured", configured());
        r.put("initialized", initialized);
        r.put("debug", BuildConfig.DEBUG);
        call.resolve(r);
    }

    /** 初始化（只在同意隐私政策后调用一次）。personalized 为玩家在设置里选的"个性化广告" */
    @PluginMethod
    public void init(PluginCall call) {
        if (!configured()) {
            call.reject("TapADN 未配置", "not_configured");
            return;
        }
        boolean personalized = Boolean.TRUE.equals(call.getBoolean("personalized", true));
        getActivity().runOnUiThread(() -> {
            if (!initialized) {
                TapAdConfig config = new TapAdConfig.Builder()
                        .withMediaId(BuildConfig.TAPAD_MEDIA_ID)
                        .withMediaName(BuildConfig.TAPAD_MEDIA_NAME)
                        .withMediaKey(BuildConfig.TAPAD_MEDIA_KEY)
                        .withTapClientId(BuildConfig.TAPTAP_CLIENT_ID)
                        .enableDebug(BuildConfig.DEBUG)
                        // 不用摇一摇：容易误触，也要用到传感器
                        .shakeEnabled(false)
                        .withCustomController(new MinimalController())
                        .build();
                TapAdSdk.init(getContext().getApplicationContext(), config);
                adNative = TapAdManager.get().createAdNative(getActivity());
                initialized = true;
            }
            applyPersonalized(personalized);
            preloadReward();
            call.resolve();
        });
    }

    /** 设置里切换"个性化广告"时调用 */
    @PluginMethod
    public void setPersonalized(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        if (initialized) getActivity().runOnUiThread(() -> applyPersonalized(on));
        call.resolve();
    }

    private static void applyPersonalized(boolean on) {
        TapAdSdk.putMediaGlobalSettings(
                Constants.Personalization.PERSONAL_ADS_TYPE,
                on ? Constants.Personalization.PERSONAL_ADS_TYPE_ALLOW : Constants.Personalization.PERSONAL_ADS_TYPE_LIMIT);
    }

    /**
     * 播放激励视频。结果：rewarded 看完（TapADN 确认可以发奖励），closed 中途关闭，unavailable 没有广告或出错。
     * 播放期间会发 adShow 事件，网页层据此收起"加载中"提示。
     */
    @PluginMethod
    public void showRewarded(PluginCall call) {
        if (!initialized || playing) {
            resolveResult(call, "unavailable");
            return;
        }
        playing = true;
        getActivity().runOnUiThread(() -> {
            if (cachedReward != null && cachedReward.isValid()) {
                TapRewardVideoAd ad = cachedReward;
                cachedReward = null;
                playReward(ad, call);
                return;
            }
            // 没有现成的就现场加载，超时按没有广告处理
            final boolean[] done = {false};
            Runnable timeout = () -> {
                if (done[0]) return;
                done[0] = true;
                finishReward(call, "unavailable");
            };
            main.postDelayed(timeout, LOAD_TIMEOUT_MS);
            loadReward(new RewardLoaded() {
                @Override
                public void onLoaded(TapRewardVideoAd ad) {
                    if (done[0]) {
                        cachedReward = ad;
                        return;
                    }
                    done[0] = true;
                    main.removeCallbacks(timeout);
                    playReward(ad, call);
                }

                @Override
                public void onFailed() {
                    if (done[0]) return;
                    done[0] = true;
                    main.removeCallbacks(timeout);
                    finishReward(call, "unavailable");
                }
            });
        });
    }

    private void playReward(TapRewardVideoAd ad, PluginCall call) {
        final boolean[] verified = {false};
        final boolean[] shown = {false};
        ad.setRewardAdInteractionListener(new TapRewardVideoAd.RewardAdInteractionListener() {
            @Override
            public void onAdShow(TapRewardVideoAd a) {
                shown[0] = true;
                notifyListeners("adShow", new JSObject());
            }

            @Override
            public void onAdClose(TapRewardVideoAd a) {
                a.dispose();
                finishReward(call, verified[0] ? "rewarded" : shown[0] ? "closed" : "unavailable");
            }

            @Override
            public void onRewardVerify(TapRewardVideoAd a, boolean ok, int amount, String name, int code, String msg) {
                Log.i(TAG, "reward verify: " + ok + " code=" + code);
                if (ok) verified[0] = true;
            }

            @Override
            public void onVideoError(TapRewardVideoAd a) {
                Log.w(TAG, "reward video error");
            }

            @Override public void onVideoComplete(TapRewardVideoAd a) {}
            @Override public void onSkippedVideo(TapRewardVideoAd a) {}
            @Override public void onAdClick(TapRewardVideoAd a) {}
            @Override public void onAdValidShow(TapRewardVideoAd a) {}
        });
        ad.showRewardVideoAd(getActivity());
    }

    private void finishReward(PluginCall call, String result) {
        playing = false;
        resolveResult(call, result);
        preloadReward();
    }

    private static void resolveResult(PluginCall call, String result) {
        JSObject r = new JSObject();
        r.put("result", result);
        call.resolve(r);
    }

    private interface RewardLoaded {
        void onLoaded(TapRewardVideoAd ad);
        void onFailed();
    }

    private void preloadReward() {
        if (!initialized || loadingReward || (cachedReward != null && cachedReward.isValid())) return;
        loadReward(new RewardLoaded() {
            @Override public void onLoaded(TapRewardVideoAd ad) { cachedReward = ad; }
            @Override public void onFailed() {}
        });
    }

    private void loadReward(RewardLoaded cb) {
        loadingReward = true;
        AdRequest request = new AdRequest.Builder()
                .withSpaceId(BuildConfig.TAPAD_REWARD_SPACE_ID)
                .withRewardName("机缘")
                .withRewardAmount(1)
                .build();
        adNative.loadRewardVideoAd(request, new TapAdNative.RewardVideoAdListener() {
            @Override
            public void onError(int code, String message) {
                loadingReward = false;
                Log.w(TAG, "reward load error " + code + ": " + message);
                cb.onFailed();
            }

            @Override
            public void onRewardVideoAdLoad(TapRewardVideoAd ad) {}

            /** 素材缓存好了再放，体验更好（官方建议） */
            @Override
            public void onRewardVideoCached(TapRewardVideoAd ad) {
                loadingReward = false;
                cb.onLoaded(ad);
            }
        });
    }

    /** 插屏：加载后立即展示，关闭、出错、超时都直接结束，不影响游戏流程 */
    @PluginMethod
    public void showInterstitial(PluginCall call) {
        if (!initialized || BuildConfig.TAPAD_INTERSTITIAL_SPACE_ID <= 0 || playing) {
            call.resolve();
            return;
        }
        playing = true;
        getActivity().runOnUiThread(() -> {
            final boolean[] done = {false};
            Runnable finish = () -> {
                if (done[0]) return;
                done[0] = true;
                playing = false;
                call.resolve();
            };
            main.postDelayed(finish, LOAD_TIMEOUT_MS);
            AdRequest request = new AdRequest.Builder().withSpaceId(BuildConfig.TAPAD_INTERSTITIAL_SPACE_ID).build();
            adNative.loadInterstitialAd(request, new TapAdNative.InterstitialAdListener() {
                @Override
                public void onError(int code, String message) {
                    Log.w(TAG, "interstitial load error " + code + ": " + message);
                    main.removeCallbacks(finish);
                    finish.run();
                }

                @Override
                public void onInterstitialAdLoad(TapInterstitialAd ad) {
                    if (done[0]) return;
                    main.removeCallbacks(finish);
                    ad.setInteractionListener(new TapInterstitialAd.InterstitialAdInteractionListener() {
                        @Override public void onAdShow() { notifyListeners("adShow", new JSObject()); }
                        @Override public void onAdClose() { ad.dispose(); finish.run(); }
                        @Override public void onAdError() { ad.dispose(); finish.run(); }
                        @Override public void onAdValidShow() {}
                        @Override public void onAdClick() {}
                    });
                    ad.show(getActivity());
                }
            });
        });
    }

    /**
     * 最小必要的隐私开关：只用 Android ID 和 OAID（广告投放与反作弊必需），
     * 不取位置、电话状态、Wi-Fi 信息、MAC、传感器、应用列表，不写外部存储
     */
    private static class MinimalController extends TapAdCustomController {
        @Override public boolean isCanUseLocation() { return false; }
        @Override public boolean isCanUsePhoneState() { return false; }
        @Override public boolean isCanUseWifiState() { return false; }
        @Override public boolean isCanUsePhoneMacAddress() { return false; }
        @Override public boolean isCanUseBssid() { return false; }
        @Override public boolean isCanUseSsid() { return false; }
        @Override public boolean isCanUseSensor() { return false; }
        @Override public boolean isCanUseWriteExternal() { return false; }
        @Override public boolean alist() { return false; }
        @Override public boolean isCanUseAndroidId() { return true; }
        @Override public boolean isCanUseOaid() { return true; }
    }
}

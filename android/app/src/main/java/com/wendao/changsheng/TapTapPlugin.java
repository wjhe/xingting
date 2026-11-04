package com.wendao.changsheng;

import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.taptap.sdk.compliance.TapTapCompliance;
import com.taptap.sdk.compliance.TapTapComplianceCallback;
import com.taptap.sdk.compliance.option.TapTapComplianceOptions;
import com.taptap.sdk.core.TapTapRegion;
import com.taptap.sdk.core.TapTapSdk;
import com.taptap.sdk.core.TapTapSdkOptions;
import com.taptap.sdk.initializer.api.TapInitCallback;
import com.taptap.sdk.initializer.api.model.ScreenOrientation;
import com.taptap.sdk.kit.internal.callback.TapTapCallback;
import com.taptap.sdk.kit.internal.exception.TapTapException;
import com.taptap.sdk.login.Scopes;
import com.taptap.sdk.login.TapTapAccount;
import com.taptap.sdk.login.TapTapLogin;

import java.util.Map;

/**
 * TapTap 登录与合规认证（实名、防沉迷）的桥接，供网页层调用。
 * Client ID / Token 由 build.gradle 从 android-keys/taptap.properties 读入 BuildConfig，不进版本库。
 * 必须在玩家同意隐私政策之后才调用 init（TapSDK 合规要求）。
 */
@CapacitorPlugin(name = "TapTap")
public class TapTapPlugin extends Plugin {
    private static final String TAG = "TapTapPlugin";
    private boolean initialized = false;
    private boolean callbackRegistered = false;

    private static boolean configured() {
        return !BuildConfig.TAPTAP_CLIENT_ID.isEmpty() && !BuildConfig.TAPTAP_CLIENT_TOKEN.isEmpty();
    }

    /** 是否配置了 Client ID / Token（没配置时游戏跳过 TapTap 流程） */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("configured", configured());
        r.put("initialized", initialized);
        call.resolve(r);
    }

    /** 初始化 TapSDK（含合规认证模块）。成功 resolve，失败 reject，code 为 TapSDK 的错误码 */
    @PluginMethod
    public void init(PluginCall call) {
        if (!configured()) {
            call.reject("TapTap Client ID 未配置", "not_configured");
            return;
        }
        if (initialized) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            TapTapSdk.addInitCallback(new TapInitCallback() {
                @Override
                public void onInitSuccess() {
                    TapTapSdk.removeInitCallback(this);
                    // 回调要在初始化完成之后注册：提前注册会被初始化覆盖，认证结果就收不到
                    registerComplianceCallback();
                    initialized = true;
                    call.resolve();
                }

                @Override
                public void onInitFail(int errorCode, @NonNull String errorMsg) {
                    TapTapSdk.removeInitCallback(this);
                    call.reject(errorMsg, String.valueOf(errorCode));
                }
            });
            TapTapSdkOptions options = new TapTapSdkOptions(BuildConfig.TAPTAP_CLIENT_ID, BuildConfig.TAPTAP_CLIENT_TOKEN, TapTapRegion.CN);
            options.setScreenOrientation(ScreenOrientation.PORTRAIT);
            options.setEnableLog(BuildConfig.DEBUG);
            // 显示切换账号按钮；不索取真实年龄段（使用 TapTap 实名时静默授权，无需玩家再点一次）
            TapTapComplianceOptions compliance = new TapTapComplianceOptions(true, false);
            TapTapSdk.init(getContext(), options, compliance);
        });
    }

    /** 合规结果（能否进入游戏、时长用尽、退出等）随时可能回调，统一转成事件交给网页层处理 */
    private void registerComplianceCallback() {
        if (callbackRegistered) return;
        callbackRegistered = true;
        TapTapCompliance.registerComplianceCallback(new TapTapComplianceCallback() {
            @Override
            public void onComplianceResult(int code, @Nullable Map<String, ?> extra) {
                Log.i(TAG, "compliance result: " + code);
                JSObject e = new JSObject();
                e.put("code", code);
                notifyListeners("compliance", e);
            }
        });
    }

    /** 本地缓存的 TapTap 账号；没有登录时 account 为空 */
    @PluginMethod
    public void currentAccount(PluginCall call) {
        JSObject r = new JSObject();
        TapTapAccount account = initialized ? TapTapLogin.getCurrentTapAccount() : null;
        if (account != null) r.put("account", accountJson(account));
        call.resolve(r);
    }

    /** 发起 TapTap 登录。只请求 basic_info，已装 TapTap 客户端的玩家可以无感登录 */
    @PluginMethod
    public void login(PluginCall call) {
        if (!initialized) {
            call.reject("TapSDK 未初始化", "not_initialized");
            return;
        }
        getActivity().runOnUiThread(() -> TapTapLogin.loginWithScopes(getActivity(), new String[]{Scopes.SCOPE_BASIC_INFO}, new TapTapCallback<TapTapAccount>() {
            @Override
            public void onSuccess(TapTapAccount account) {
                JSObject r = new JSObject();
                r.put("account", accountJson(account));
                call.resolve(r);
            }

            @Override
            public void onFail(@NonNull TapTapException exception) {
                call.reject(exception.getMessage() != null ? exception.getMessage() : "登录失败", "fail");
            }

            @Override
            public void onCancel() {
                call.reject("玩家取消登录", "cancel");
            }
        }));
    }

    /**
     * 退出登录：清除本地 TapTap 登录信息，并重置防沉迷状态。
     * 等两步都做完再 resolve：之前先 resolve，网页层回到门口时账号可能还没清掉，会被自动登录回游戏。
     */
    @PluginMethod
    public void logout(PluginCall call) {
        if (!initialized) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                TapTapLogin.logout();
                TapTapCompliance.exit();
            } catch (Exception e) {
                Log.w(TAG, "logout failed", e);
            }
            call.resolve();
        });
    }

    /** 开始实名认证与防沉迷检查，结果通过 compliance 事件返回 */
    @PluginMethod
    public void startCompliance(PluginCall call) {
        String openId = call.getString("openId");
        if (!initialized || openId == null || openId.isEmpty()) {
            call.reject("缺少 openId 或 TapSDK 未初始化", "bad_state");
            return;
        }
        Log.i(TAG, "compliance startup");
        getActivity().runOnUiThread(() -> TapTapCompliance.startup(getActivity(), openId));
        call.resolve();
    }

    private static JSObject accountJson(TapTapAccount account) {
        JSObject a = new JSObject();
        a.put("openId", account.getOpenId());
        a.put("unionId", account.getUnionId());
        return a;
    }
}

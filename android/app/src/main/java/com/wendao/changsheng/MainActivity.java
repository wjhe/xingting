package com.wendao.changsheng;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 本地插件要在 super.onCreate 之前注册
        registerPlugin(TapTapPlugin.class);
        registerPlugin(TapAdPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

package io.vita.rppg;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VitaHealthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

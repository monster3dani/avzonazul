package net.danlab.avzonazul;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin propio para descargar e instalar las versiones nuevas
        registerPlugin(UpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

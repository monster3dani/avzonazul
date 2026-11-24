package net.danlab.avzonazul;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins propios de AVZonazul
        registerPlugin(UpdaterPlugin.class);   // descargar e instalar versiones nuevas
        registerPlugin(AppsPlugin.class);      // abrir la app de pago si está instalada
        registerPlugin(TicketPlugin.class);    // cuenta atrás fija en las notificaciones
        super.onCreate(savedInstanceState);
    }
}

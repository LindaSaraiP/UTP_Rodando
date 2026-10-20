
'use strict';

// Registro del Service Worker de Rodando UTP
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        '/service-worker.js',
        { scope: '/' }
      );

      console.log(
        'Rodando UTP: Service Worker registrado correctamente.',
        registration.scope
      );

      await registration.update();
    } catch (error) {
      console.error(
        'Rodando UTP: error al registrar el Service Worker.',
        error
      );
    }
  });
}

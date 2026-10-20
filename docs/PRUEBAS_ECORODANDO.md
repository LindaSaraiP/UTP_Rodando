# Pruebas funcionales realizadas — EcoRodando v4.0

Se validó localmente con Node.js 22:

- `GET /api/health` responde con versión `4.0.0-ecorodando`.
- Registro real con correo institucional y sesión protegida.
- Creación de ruta.
- Registro de un segundo usuario.
- Reservación de un lugar.
- Finalización de viaje por el conductor.
- Rechazo de finalización antes de la hora de salida o sin pasajeros.
- Actualización automática de EcoPuntos, nivel, insignias, lugares compartidos, cooperación e impacto estimado.
- Actualización del impacto comunitario.
- El cálculo EcoRodando se realiza en el backend a partir de SQLite; no depende de valores enviados por el navegador.

## Escenario validado

Un conductor publicó una ruta, un pasajero reservó un lugar y el viaje se marcó como completado. El conductor obtuvo:

- 1 viaje compartido finalizado.
- 1 lugar compartido.
- 1 compañero transportado.
- 75 EcoPuntos.
- Insignia **Primer viaje**.
- 1.8 kg CO₂e estimados con el factor pedagógico configurado.

La base de datos de prueba fue eliminada antes de empaquetar el proyecto; al iniciar la aplicación se crea una base limpia con datos demo.

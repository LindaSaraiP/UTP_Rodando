# EcoRodando — propuesta innovadora implementada

## Objetivo

Convertir la movilidad colaborativa en una experiencia medible y motivadora. Cuando un viaje compartido se completa, el backend registra su participación dentro del historial existente y calcula el impacto del usuario.

## Flujo funcional

1. Un conductor publica una ruta.
2. Uno o más pasajeros reservan lugares.
3. Al llegar la hora de salida, el conductor puede seleccionar **Finalizar y sumar EcoPuntos**.
4. El backend valida que la ruta pertenezca al conductor, siga activa, ya haya alcanzado la hora de salida y tenga al menos una reservación confirmada.
5. La ruta cambia a `completed`.
6. Las estadísticas EcoRodando se recalculan desde SQLite.

## Sistema de puntos

Los puntos se derivan de datos reales y no se guardan como un número editable:

- 50 puntos por cada viaje compartido finalizado en el que participa el usuario.
- 15 puntos por cada lugar compartido acumulado.
- 10 puntos adicionales por cada compañero transportado cuando el usuario conduce.

## Niveles

- Semilla: 0–99
- Brote: 100–249
- Ruta Verde: 250–499
- Conductor Verde: 500–999
- Embajador Verde: 1000+

## Insignias

- Primer viaje
- Rodador activo
- Impacto verde
- Conductor frecuente
- Impulso comunitario

## Estimación ambiental

Se utiliza un factor pedagógico configurable de **1.8 kg CO₂e por plaza compartida finalizada**. Esta cifra es deliberadamente identificada como estimación porque la versión actual no almacena distancia exacta, rendimiento ni tipo de combustible. En una versión posterior, el cálculo puede migrar a kilómetros reales mediante geolocalización y características del vehículo.

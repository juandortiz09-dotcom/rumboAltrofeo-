# Rumbo al Trofeo: cómo usarlo

## Arrancar el juego
1. Abre una terminal en esta carpeta (en VS Code: **Ctrl + ñ**).
2. Escribe `npm start`.
3. La terminal muestra 3 direcciones:
   - **Pantalla** (videobeam): `http://localhost:3000/pantalla`. Haz clic en "¡Listo!" para activar el sonido y la pantalla completa. Con la tecla **F** vuelve a pantalla completa.
   - **Moderador**: `http://localhost:3000/moderador`. El PIN es **1234**.
   - **Revisión de contenido**: `http://localhost:3000/revision` (mismo PIN). Todas las cartas con sus preguntas y respuestas, lo que falta y la lista de materiales para marcar.
   - **Celulares**: escanean el QR de la pantalla, o escriben la dirección `http://192.168.x.x:3000/jugar` que muestra la terminal.
4. Para apagar el servidor: **Ctrl + C** en la terminal.

> La primera vez, Windows puede preguntar si deja que Node.js use la red. Marca **"Redes privadas"** y acepta. Si no, los celulares no entran.

## Durante la partida
- Todo se maneja desde el panel del moderador: iniciar, avanzar el instructivo, cerrar la pregunta de inicio, empezar, juzgar, el temporizador y el siguiente turno.
- **Si un celular falla**, el equipo vuelve a entrar con el **código de 3 números** de su equipo. Se ve en su celular mientras esperan y en el panel del moderador.
- **Si un celular no funciona**, el moderador puede tirar el dado, elegir el rival y elegir la carta por ese equipo.
- **Si te equivocas al juzgar**, corrige con los botones − / + de cada equipo en el panel derecho.
- **Si se cae el servidor o se apaga el portátil**, vuelve a correr `npm start`. La partida sigue donde iba (se guarda en `estado.json`).
- **Nueva partida** (panel derecho) borra todo y genera un código nuevo.

## Cambiar cartas o preguntas
1. Edita `Rumbo al Trofeo.xlsx`.
2. Corre `npm run datos`.
3. Reinicia el servidor.

### Canciones (para las cartas de Música)
Están en **Canciones.xlsx** (carpeta del juego): las 43 canciones de la playlist PV con nombre, artista y emojis. Las columnas son:

| Nombre | Artista | Emojis | 4 frases seguidas | 8 frases del coro | Otras formas del nombre |
| --- | --- | --- | --- | --- | --- |
| Nombre de la canción | Artista | 🎵🙌🔥 | frase 1 / frase 2 / frase 3 / frase 4 | frase 1 / … / frase 8 | otros nombres, separados por coma |

- Las frases van separadas con `/`. Solo las usan "Ordena la letra" (MU04) y "Ordena el coro completo" (MU16); basta con llenarlas en 3 o 4 canciones. Mientras estén vacías, esas 2 cartas se juegan en modo presencial.
- Para quitar una canción, borra su fila. Para agregar una, añade una fila (debe estar en la playlist, porque el moderador la pone en el parlante).
- Después de cambiar el archivo: `npm run datos`.

### Preguntas para decidir quién empieza
Están en `scripts/generar-datos.js`, en la parte que dice `preguntasInicio`. Son las 3 preguntas reales.

## Plan B de red
Si los celulares no abren la página con el Wi-Fi del salón:
1. Crea un punto de acceso desde el portátil (Configuración → Red → Zona con cobertura inalámbrica móvil) o desde un celular.
2. Conecta el portátil y todos los celulares a esa red.
3. Reinicia el servidor (`npm start`): el QR se actualiza solo con la nueva dirección.
4. Si el QR sigue mostrando una dirección equivocada, arráncalo así: `$env:IP_PUBLICA="192.168.137.1"; npm start` (cambia el número por la IP correcta).

## Ensayo antes de la sesión
- [ ] Portátil conectado al videobeam y al Wi-Fi del salón.
- [ ] 4 celulares reales entran por el QR.
- [ ] Jugar algunos turnos de cada tipo de casilla.
- [ ] Recargar un celular y la pantalla a mitad de partida.
- [ ] Probar el plan B de red.
- [ ] Al final, **Nueva partida** para empezar limpio.

## Pruebas automáticas
`npm run probar` juega las 107 cartas y 30 partidas al azar para revisar que el motor no falle.

## Despliegue en la nube (Render o Railway)
Este juego usa **Socket.IO** (WebSockets en tiempo real) y estado en servidor, por lo que requiere un host Node.js persistente como **Render** o **Railway** (no Vercel serverless).

- **Render (1 clic):** abre `https://render.com/deploy?repo=https://github.com/juandortiz09-dotcom/rumboAltrofeo-` (usa `render.yaml` automáticamente).
- **Railway:** crea un proyecto nuevo en `https://railway.com/new` seleccionando este repositorio de GitHub (usa `railway.json` automáticamente).
- **Variables opcionales:**
  - `PIN`: PIN del moderador (por defecto `1234`).
  - `PUBLIC_URL`: solo si quieres forzar un dominio personalizado; normalmente se detecta automáticamente desde el navegador y el QR se genera en HTTPS.
- **Tip para el evento:** en el plan gratuito de Render el servicio se duerme tras 15 min sin uso. Abre `/pantalla` unos 2 minutos antes de empezar para despertarlo; mientras la pantalla y el moderador estén abiertos, el servidor se mantiene activo durante toda la partida.

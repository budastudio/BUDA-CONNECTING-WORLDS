# BUDA STUDIO — CONNECTING WORLDS

Primera versión funcional: una galería 3D diseñada en Blender, exportada como
GLB, y navegable en primera persona directamente en el navegador con
**Vite + Three.js**.

Esta NO es la experiencia final. El objetivo de esta etapa es únicamente
verificar cómo se comporta la arquitectura real (escala, materiales,
iluminación, geometría, rendimiento) al pasar de Blender a Three.js.

---

## 1. Instalación

```bash
npm install
```

## 2. Dónde colocar el GLB

El archivo debe estar en:

```text
public/models/2GALERIADUPLACHACKRAS.glb
```

**Ya está colocado ahí** en este entrego (se copió el archivo que subiste).
Si en el futuro reemplazás el modelo, mantené exactamente ese nombre de
archivo y esa ruta — `src/main.js` carga el modelo desde
`/models/2GALERIADUPLACHACKRAS.glb`.

## 3. Cómo ejecutar (desarrollo)

```bash
npm run dev
```

Abrí la URL que muestra la terminal (normalmente `http://localhost:5173`).

## 4. Controles

```text
CLICK          entrar a la experiencia (activa Pointer Lock)
W / A / S / D  caminar
ARROW KEYS     caminar (alternativa)
MOUSE          mirar alrededor
SHIFT          correr
ESC            liberar el mouse / volver a ver las instrucciones
```

La cámara mantiene una altura de ojos de **1.65 m** sobre el piso detectado
bajo el visitante.

## 5. Cómo hacer build

```bash
npm run build
```

Esto genera una carpeta `dist/` lista para desplegar como sitio estático
(incluye el GLB copiado desde `public/`). Podés previsualizar ese build con:

```bash
npm run preview
```

## 6. Qué información aparece en consola

Al cargar el modelo, la consola del navegador muestra:

```text
GALLERY LOADED
Size: ...
Center: ...
Meshes: ...
Approx triangles: ...
Materials: ...

[BUDA] Gallery loaded
[BUDA] Bounds ...
[BUDA] Size ...
[BUDA] Center ...
[BUDA] Mesh count ...
[BUDA] Triangle count ...
[BUDA] Material count ...
```

Además, por cada mesh del modelo se imprime:

```text
MESH: nombre_del_mesh
MATERIAL: nombre_del_material
```

Esto sirve para identificar rápidamente si algún mesh o material no llegó
como se esperaba desde Blender.

En pantalla, arriba a la derecha, aparece un pequeño panel de debug discreto
con:

```text
MESHES
TRIANGLES
SIZE
```

## 7. Qué partes son provisionales

Estas piezas existen solo para que la galería sea recorrible *ya mismo*, y
están comentadas como tales directamente en `src/main.js`:

- **Colisión con bounding box global**: el visitante no puede salir del
  volumen total del GLB (`THREE.Box3` de toda la escena), pero esto **no es
  colisión arquitectónica real**. No conoce paredes, columnas, puertas ni
  objetos individuales — solo el "cubo" exterior de toda la galería.
- **Seguimiento de piso por raycast**: como el modelo es un dúplex (dos
  niveles), se lanza un rayo hacia abajo desde la posición del visitante
  para apoyar la altura de los ojos sobre la superficie detectada. Esto
  permite subir/bajar entre niveles sin un sistema de colliders real, pero
  puede comportarse de forma extraña sobre huecos, escaleras muy abiertas,
  o geometría no cerrada.
- **Iluminación inicial**: una `HemisphereLight`, una `DirectionalLight` y
  dos `PointLight` muy sutiles, pensadas solo para poder evaluar la
  arquitectura. El mood final (más oscuro, más dramático, etc.) se define
  después de ver cómo responde el modelo real.
- **Materiales**: se respetan tal cual vienen del GLB — no se reemplazan
  por materiales genéricos. Si algo se ve mal (un material negro, una
  textura faltante, caras que deberían ser dobles y no lo son), es un dato
  útil para la siguiente etapa, no algo que este código "arregle" por su
  cuenta.

## 8. Próximos pasos sugeridos

1. Revisar en consola `Size` / `Center` y confirmar que la escala en metros
   tiene sentido (si la galería se siente gigante o diminuta, es un tema de
   escala de exportación en Blender, no de la cámara).
2. Revisar la lista de `MESH` / `MATERIAL` para detectar nombres genéricos
   ("Material.001", etc.) que convenga renombrar en Blender antes de seguir.
3. Diseñar colliders reales para paredes, pisos, columnas y puertas,
   reemplazando el bounding box global.
4. Definir la iluminación final (mood oscuro, elegante, de galería
   contemporánea) ahora que se puede ver la arquitectura real en el
   navegador.
5. Preparar los puntos de entrada para objetos interactivos (obras,
   portales, links a otros mundos digitales) dentro del espacio ya
   navegable.
6. Medir rendimiento con el conteo de triángulos/materiales mostrado en
   consola y decidir si hace falta optimizar el GLB (por ahora,
   intencionalmente, no se optimiza nada).

---

## Estructura del proyecto

```text
BUDA-CONNECTING-WORLDS/
├── public/
│   └── models/
│       └── 2GALERIADUPLACHACKRAS.glb
├── src/
│   ├── main.js       # toda la lógica: escena, cámara, luces, carga del GLB,
│   │                  # input, navegación, debug, resize, loop de animación
│   │                  # (organizado en secciones comentadas, no una función gigante)
│   └── style.css      # UI mínima: marca, hint de controles, crosshair, loading
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

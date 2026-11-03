# La transición entre pantallas

Cambiar de pantalla no es un corte: el navegador se queda enseñando la que se
va hasta que la siguiente está pintada, y entonces funde una con otra. Son
tres reglas en `front/comun/theme.css` y **ningún JavaScript**:

```css
@view-transition{navigation:auto}
.vt-nav{view-transition-name:vt-barra}
@media(prefers-reduced-motion:reduce){ @view-transition{navigation:none} }
```

La barra de pestañas tiene nombre propio para que no entre en el fundido:
[[barra_de_navegacion]].

## Hubo un fundido a mano, y duró un día

Hasta el 2026-11-02 esto lo hacía `front/comun/vt-transicion.js`, 120 líneas
con un velo, un interceptor de clics, tres redes de seguridad y un `pageshow`.
Se escribió así porque **Firefox no entiende `@view-transition`**, y se había
pedido que funcionara en todos los navegadores.

Lo tiró Adrián el mismo día, al verlo: el velo iba **al color del fondo**, así
que entre las dos pantallas quedaba un rato de fondo liso tan largo como
tardara en cargar la siguiente —con `/rating` o `/players`, varios cientos de
milisegundos—, y eso no lo arregla ninguna curva de animación. Además cobraba
160 ms de retardo a cada clic antes siquiera de empezar a cargar.

El precio de la decisión, que conviene no olvidar: **en Firefox no hay
fundido**. No se rompe nada, la navegación se queda como estaba. Chrome y Edge
lo tienen desde la 126 y Safari desde la 18.2; Firefox lo lleva en Interop
2026, sin fecha. El día que lo soporte, aquí no hay que tocar nada.

## Lo que se gana, además de la suavidad

**Funde toda la navegación, no sólo los enlaces.** El script sólo podía
interceptar clics en `<a>`, y la mayoría de los botones de estas páginas
saltan con `onclick="window.location=..."`, que se le escapaban. El navegador
no distingue: funde igual un enlace, un `location.href` y el botón atrás.

Comprobado el 2026-11-02 en local, guardando `!!e.viewTransition` del evento
`pageswap` en `sessionStorage` y leyéndolo ya en la pantalla siguiente:

| Cómo se navega | ¿Hubo transición? |
| --- | --- |
| Enlace de la barra de pestañas (`/comunidad` → `/rating`) | sí |
| Botón de la portada con `window.location` (Estadísticas) | sí |

## El panel oculto no pinta, y entonces no hay transición

La primera medición dio `hubo: false` en todo. No era el CSS: **con el panel
del navegador oculto el navegador no pinta**, `document.timeline.currentTime`
se queda clavado en 0 y una transición que nadie va a ver se salta entera.
`document.visibilityState` decía `visible` igualmente, así que ese dato no
sirve para descartarlo.

Con el panel a la vista, el reloj avanza y las transiciones ocurren. Es la
misma trampa que ya está apuntada en [[sistema_visual_viper_strike]] para
medir el splash: antes de medir nada que se mueva, enseñar el panel.

## Cómo se ve, y cómo se mira

Para poder verla se alarga a propósito y se quita después:

```css
/* TEMPORAL */
::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation-duration:2.5s !important}
```

Tiene que ir en `theme.css`, no inyectada desde la consola: los
pseudoelementos de la transición viven en el documento que **entra**, y ahí no
se puede inyectar nada antes de que cargue.

Con eso medido el 2026-11-02: a mitad de camino la URL ya es la nueva mientras
la pantalla todavía enseña la vieja —que es justo lo que se quería, el
navegador aguanta la de salida—, el contenido es una mezcla de las dos, y la
barra de pestañas se ve entera y nítida con la pestaña nueva ya encendida.

## Lo que no se comprobó

- **Nada en Firefox**: aquí no hay. Lo que se espera es que no pase nada.
- **Nada en un móvil de verdad**, ni con la app instalada, ni sobre la
  latencia de Vercel. En `localhost` la pantalla siguiente está lista casi al
  instante; con red real, el rato que el navegador aguanta la pantalla vieja
  es más largo, y ése es precisamente el caso que esto viene a mejorar.
- **Que `@view-transition{navigation:none}` dentro de `@media` apague de
  verdad el fundido con «reducir movimiento»**. Lo medido es que la regla se
  analiza: aparece como `CSSViewTransitionRule` dentro de la `CSSMediaRule`.
  No se pudo simular la preferencia en este navegador.

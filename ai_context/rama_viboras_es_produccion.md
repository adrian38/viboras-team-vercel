# `viboras` es la rama por defecto y la de producción

No `master`. Un push a `viboras` **despliega a producción directamente**: no hay
entorno intermedio ni aprobación.

```
origin/HEAD -> origin/viboras
```

`master` existe y está **detrás**; no se usa. La tarjeta del panel de Vercel ha
llegado a decir «To update your Production Deployment, push to the master
branch», que es información obsoleta y no refleja la configuración real.
Confirmado por el usuario el 2026-10-08.

## Qué implica

- Antes de hacer `git push` hay que tener claro que eso sale al grupo. No es un
  `git push` cualquiera.
- Los despliegues de previsualización salen de otras ramas; producción sale de
  ésta.
- Nada de `--force` sobre `viboras`.

## Variables de entorno y despliegue

Las variables nuevas **no entran en vigor en el despliegue actual**: hace falta
un despliegue nuevo. Conectar una integración (como la de Neon) dispara uno
automáticamente, así que no siempre hay que redesplegar a mano — conviene
comprobar antes de hacerlo.

## Verificar que un despliegue está vivo

La CDN puede servir la versión anterior durante unos segundos después de que
Vercel dé el despliegue por listo: un fichero nuevo puede dar 404 y 200 en
peticiones consecutivas. Esperar a que se estabilice antes de dar nada por roto:

```bash
until [ "$(curl -s -o /dev/null -w '%{http_code}' https://viboras-team-vercel.vercel.app/<fichero-nuevo>)" = "200" ]; do sleep 10; done
```

Relacionado: [[neon_en_produccion]].

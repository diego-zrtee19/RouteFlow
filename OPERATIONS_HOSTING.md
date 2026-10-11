# Operaciones alojadas

El Preview usa Supabase Cron del proyecto de desarrollo `xnnkcgzijlpwxnvarqng`.
El job `routeflow-preview-operations` llama al endpoint HTTPS autorizado cada cinco
minutos. No depende del worker local ni de los cron de Vercel Preview. El proyecto
Supabase y Vercel deben permanecer disponibles; esto no garantiza disponibilidad
ni elimina los límites de sus planes.

La migración `20261011040459_optional_operations_scheduler.sql` instala las
extensiones y una función privada, pero **no activa jobs ni copia secretos**.
Los administradores provisionan por separado en Vault `routeflow_operations_url`
y `routeflow_operations_secret`, propios de cada entorno. No mostrar ni consultar
los valores descifrados en reportes. Los roles de la aplicación no tienen acceso
a la función ni al esquema privado.

Para repetir únicamente el setup del Preview existente: instalar temporalmente
`supabase/operations/provision-preview.sql`, ejecutar
`node scripts/provision-operations-vault.cjs` y eliminar inmediatamente la función
temporal con `DROP FUNCTION public.routeflow_provision_preview_operations(text);`.
El script rechaza un proyecto diferente y no imprime credenciales. El archivo
local con el secreto no se guarda en Git.

Una vez configurado Vault, el administrador programa:

```sql
select cron.schedule('routeflow-preview-operations', '*/5 * * * *',
  'select routeflow_operations.enqueue();');
```

Para comprobarlo: consultar el job y `cron.job_run_details`, comprobar HTTP 200
en `net._http_response` y una ejecución reciente SUCCEEDED en `operation_runs`.
Un resultado succeeded del cron solo confirma que se encoló la llamada HTTP;
se debe comprobar también el resultado del servidor. No imprimir headers de
`net.http_request_queue`, ya que contienen autorización.

Para suspender o reactivar sin eliminar historial:

```sql
select cron.alter_job(jobid := 1, active := false);
-- Obtener el jobid correcto por nombre antes de actuar en otro entorno.
```

Mantener detenido `npm run operations:dev` mientras este job atienda la misma base.
Antes de pasar a LIVE, provisionar un job y secretos separados en Supabase de
producción, verificar sus ejecuciones y retirar cualquier programador redundante.
El correo sigue en PREVIEW y Stripe TEST impide el envío de emails reales.

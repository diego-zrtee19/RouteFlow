-- Development only. Synthetic fixtures roll back, no outbound messages.
BEGIN;
DO $$
DECLARE a uuid; b uuid; client uuid:=gen_random_uuid(); first jsonb; again jsonb; task uuid; rev integer;
BEGIN
 INSERT INTO public.sellers(user_id,store_username,store_name) VALUES('tasks_'||gen_random_uuid(),'tasks_'||replace(gen_random_uuid()::text,'-',''),'Task fixture') RETURNING id INTO a;
 INSERT INTO public.sellers(user_id,store_username,store_name) VALUES('other_'||gen_random_uuid(),'other_'||replace(gen_random_uuid()::text,'-',''),'Other fixture') RETURNING id INTO b;
 first:=public.create_seller_task(a,'fixture',client,'Review stock','Private note',now());
 -- Use the saved due date for the exact retry payload.
 task:=(first->>'id')::uuid;
 again:=public.create_seller_task(a,'fixture',client,'Review stock','Private note',(SELECT due_at FROM public.seller_tasks WHERE id=task));
 IF first->>'id' IS DISTINCT FROM again->>'id' OR NOT (again->>'duplicate')::boolean THEN RAISE EXCEPTION 'Retry created another task'; END IF;
 BEGIN
  PERFORM public.create_seller_task(a,'fixture',client,'Changed title','Private note',NULL);
  RAISE EXCEPTION 'changed_payload_accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='changed_payload_accepted' THEN RAISE; END IF; END;
 IF public.set_seller_task_done(b,'other',task,1,true) IS NOT NULL THEN RAISE EXCEPTION 'Wrong owner changed task'; END IF;
 rev:=public.set_seller_task_done(a,'fixture',task,1,true);
 IF rev<>2 THEN RAISE EXCEPTION 'Completion failed'; END IF;
 IF public.set_seller_task_done(a,'fixture',task,1,true)<>2 THEN RAISE EXCEPTION 'Completion retry failed'; END IF;
 IF public.set_seller_task_done(a,'fixture',task,1,false) IS NOT NULL THEN RAISE EXCEPTION 'Stale state overwrite'; END IF;
 IF public.set_seller_task_done(a,'fixture',task,2,false)<>3 THEN RAISE EXCEPTION 'Reopen failed'; END IF;
 IF (SELECT count(*) FROM public.seller_task_activity WHERE task_id=task)<>3 THEN RAISE EXCEPTION 'Activity duplicated or missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.seller_task_activity WHERE task_id=task AND seller_id<>a) THEN RAISE EXCEPTION 'Wrong activity owner'; END IF;
 IF has_table_privilege('anon','public.seller_tasks','SELECT') OR has_table_privilege('authenticated','public.seller_task_activity','SELECT') OR has_function_privilege('authenticated','public.set_seller_task_done(uuid,text,uuid,integer,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Task records exposed'; END IF;
END $$;
SELECT 'PASS: task retries, owner isolation, stale-state protection, reversible completion and atomic activity' AS verification;
ROLLBACK;

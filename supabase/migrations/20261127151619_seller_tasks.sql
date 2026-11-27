CREATE TABLE public.seller_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 200),
  detail text NOT NULL DEFAULT '' CHECK(char_length(detail)<=2000),
  due_at timestamptz,
  done boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(seller_id,client_id)
);
CREATE INDEX seller_tasks_queue ON public.seller_tasks(seller_id,done,due_at,created_at);
CREATE TABLE public.seller_task_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.seller_tasks(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  actor text NOT NULL,
  action text NOT NULL CHECK(action IN ('created','completed','reopened')),
  revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX seller_task_activity_task ON public.seller_task_activity(task_id,created_at DESC);
CREATE INDEX seller_task_activity_seller ON public.seller_task_activity(seller_id,created_at DESC);
ALTER TABLE public.seller_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_task_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seller_tasks,public.seller_task_activity FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.seller_tasks TO service_role;
GRANT SELECT,INSERT ON public.seller_task_activity TO service_role;
GRANT USAGE ON SEQUENCE public.seller_task_activity_id_seq TO service_role;

CREATE FUNCTION public.create_seller_task(p_seller uuid,p_actor text,p_client uuid,p_title text,p_detail text,p_due timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE task public.seller_tasks;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_seller::text,2));
  SELECT * INTO task FROM public.seller_tasks WHERE seller_id=p_seller AND client_id=p_client;
  IF FOUND THEN
    IF task.title IS DISTINCT FROM trim(p_title) OR task.detail IS DISTINCT FROM p_detail OR task.due_at IS DISTINCT FROM p_due THEN
      RAISE EXCEPTION 'Task key reused with different content';
    END IF;
    RETURN jsonb_build_object('id',task.id,'duplicate',true);
  END IF;
  IF (SELECT count(*) FROM public.seller_tasks WHERE seller_id=p_seller AND NOT done)>=500 THEN
    RAISE EXCEPTION 'Complete existing tasks before creating more';
  END IF;
  INSERT INTO public.seller_tasks(seller_id,client_id,title,detail,due_at,created_by)
  VALUES(p_seller,p_client,trim(p_title),p_detail,p_due,p_actor) RETURNING * INTO task;
  INSERT INTO public.seller_task_activity(task_id,seller_id,actor,action,revision)
  VALUES(task.id,p_seller,p_actor,'created',task.revision);
  RETURN jsonb_build_object('id',task.id,'duplicate',false);
END $$;

CREATE FUNCTION public.set_seller_task_done(p_seller uuid,p_actor text,p_task uuid,p_revision integer,p_done boolean)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE task public.seller_tasks;
BEGIN
  IF p_done IS NULL OR p_revision IS NULL THEN RAISE EXCEPTION 'Invalid task state'; END IF;
  SELECT * INTO task FROM public.seller_tasks WHERE id=p_task AND seller_id=p_seller FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF task.done=p_done THEN RETURN task.revision; END IF;
  IF task.revision<>p_revision THEN RETURN NULL; END IF;
  UPDATE public.seller_tasks SET done=p_done,revision=revision+1,updated_at=now()
  WHERE id=task.id RETURNING * INTO task;
  INSERT INTO public.seller_task_activity(task_id,seller_id,actor,action,revision)
  VALUES(task.id,p_seller,p_actor,CASE WHEN p_done THEN 'completed' ELSE 'reopened' END,task.revision);
  RETURN task.revision;
END $$;
REVOKE ALL ON FUNCTION public.create_seller_task(uuid,text,uuid,text,text,timestamptz),public.set_seller_task_done(uuid,text,uuid,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_seller_task(uuid,text,uuid,text,text,timestamptz),public.set_seller_task_done(uuid,text,uuid,integer,boolean) TO service_role;

-- Independent, synthetic-only feasibility schema. NOT DEPLOYED / NOT VERIFIED.
-- Apply once to a disposable Supabase Cloud Free test project, never production.
BEGIN;
CREATE TABLE public.mf_trial_datasets (
  owner uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  PRIMARY KEY (owner,id)
);
CREATE TABLE public.mf_trial_flights (
  owner uuid NOT NULL DEFAULT auth.uid(),
  id uuid NOT NULL,
  dataset_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND payload @> '{"synthetic":true}'::jsonb AND octet_length(payload::text)<=4096),
  PRIMARY KEY (owner,id),
  FOREIGN KEY (owner,dataset_id) REFERENCES public.mf_trial_datasets(owner,id) ON DELETE CASCADE
);
-- These profile/settings and learning-attempt rows exist only inside a run's
-- synthetic dataset. This is not a production account or profile schema.
CREATE TABLE public.mf_trial_profile_settings (
  owner uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  dataset_id uuid NOT NULL,
  label text NOT NULL CHECK (label ~ '^Synthetic [A-Za-z0-9 ]{1,40}$'),
  settings jsonb NOT NULL CHECK (
    jsonb_typeof(settings)='object'
    AND settings @> '{"synthetic":true}'::jsonb
    AND octet_length(settings::text)<=2048
  ),
  PRIMARY KEY (owner,dataset_id),
  FOREIGN KEY (owner,dataset_id) REFERENCES public.mf_trial_datasets(owner,id) ON DELETE CASCADE
);
CREATE TABLE public.mf_trial_learning_attempts (
  owner uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  dataset_id uuid NOT NULL,
  id uuid NOT NULL,
  format_version smallint NOT NULL CHECK (format_version=1),
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload)='object'
    AND payload @> '{"synthetic":true}'::jsonb
    AND (payload->'formatVersion') IS NOT DISTINCT FROM to_jsonb(format_version)
    AND octet_length(payload::text)<=4096
  ),
  PRIMARY KEY (owner,dataset_id,id),
  FOREIGN KEY (owner,dataset_id) REFERENCES public.mf_trial_datasets(owner,id) ON DELETE CASCADE
);
ALTER TABLE public.mf_trial_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mf_trial_flights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mf_trial_profile_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mf_trial_learning_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mf_trial_datasets, public.mf_trial_flights,
  public.mf_trial_profile_settings, public.mf_trial_learning_attempts FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.mf_trial_datasets, public.mf_trial_flights,
  public.mf_trial_profile_settings, public.mf_trial_learning_attempts TO authenticated;
CREATE POLICY mf_trial_dataset_owner ON public.mf_trial_datasets TO authenticated
  USING ((SELECT auth.uid())=owner) WITH CHECK ((SELECT auth.uid())=owner);
CREATE POLICY mf_trial_flight_owner ON public.mf_trial_flights TO authenticated
  USING ((SELECT auth.uid())=owner) WITH CHECK ((SELECT auth.uid())=owner);
CREATE POLICY mf_trial_profile_settings_owner ON public.mf_trial_profile_settings TO authenticated
  USING ((SELECT auth.uid())=owner) WITH CHECK ((SELECT auth.uid())=owner);
CREATE POLICY mf_trial_learning_attempt_owner ON public.mf_trial_learning_attempts TO authenticated
  USING ((SELECT auth.uid())=owner) WITH CHECK ((SELECT auth.uid())=owner);

-- Server command derives identity from the verified request JWT; no owner argument.
-- Invoker privileges retain caller RLS; no service key or paid AI involved.
CREATE FUNCTION public.mf_trial_record(p_dataset uuid, p_flight uuid, p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.mf_trial_datasets WHERE owner=auth.uid() AND id=p_dataset
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR p_payload->'synthetic' IS DISTINCT FROM 'true'::jsonb
     OR octet_length(p_payload::text)>4096 THEN
    RAISE EXCEPTION 'invalid synthetic payload' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.mf_trial_flights(owner,id,dataset_id,payload)
  VALUES (auth.uid(),p_flight,p_dataset,p_payload)
  ON CONFLICT(owner,id) DO UPDATE SET payload=excluded.payload, dataset_id=excluded.dataset_id;
  RETURN p_flight;
END;
$$;
REVOKE ALL ON FUNCTION public.mf_trial_record(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mf_trial_record(uuid,uuid,jsonb) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('moflight-trial','moflight-trial',false,65536,ARRAY['application/json']);
CREATE POLICY mf_trial_files ON storage.objects TO authenticated
  USING (bucket_id='moflight-trial' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text)
  WITH CHECK (bucket_id='moflight-trial' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
COMMIT;

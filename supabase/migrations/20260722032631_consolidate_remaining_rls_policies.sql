-- Consolidate remaining equivalent permissive policies without widening access.

-- Agent Data Input submissions are Edge-Function-only so authenticated clients
-- cannot bypass JWT/payload validation. The function inserts with service role;
-- database triggers remain authoritative for role, quota, ban, and discount rules.
DROP POLICY IF EXISTS "agent_data_inputs_insert_own" ON public.agent_data_inputs;
DROP POLICY IF EXISTS "agent_data_inputs_insert_blocked" ON public.agent_data_inputs;
CREATE POLICY "agent_data_inputs_insert_blocked"
  ON public.agent_data_inputs
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "agent_data_inputs_update_blocked" ON public.agent_data_inputs;
DROP POLICY IF EXISTS "agent_data_inputs_delete_blocked" ON public.agent_data_inputs;

-- The admin policies are the only direct write policies on bans. The false
-- policies never restricted the permissive admin policies and only added work.
DROP POLICY IF EXISTS "agent_data_input_bans_insert_blocked" ON public.agent_data_input_bans;
DROP POLICY IF EXISTS "agent_data_input_bans_update_blocked" ON public.agent_data_input_bans;
DROP POLICY IF EXISTS "agent_data_input_bans_delete_blocked" ON public.agent_data_input_bans;
DROP POLICY IF EXISTS "agent_data_input_bans_select_own_or_admin" ON public.agent_data_input_bans;

-- These legacy lead policies duplicate the canonical policies exactly.
DROP POLICY IF EXISTS "Users insert own leads" ON public.leads;
DROP POLICY IF EXISTS "Users delete own leads" ON public.leads;

-- Preserve self-service history and authoritative platform-admin review in one policy.
DROP POLICY IF EXISTS "role_switch_history_admin_select" ON public.role_switch_history;
DROP POLICY IF EXISTS "role_switch_history_select" ON public.role_switch_history;
CREATE POLICY "role_switch_history_select"
  ON public.role_switch_history
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DO $block$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "typing_channel_participant_select" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "typing_channel_participant_insert" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "video_room_channel_select" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "video_room_channel_insert" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "realtime_messages_participant_select" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "realtime_messages_participant_insert" ON realtime.messages';

    EXECUTE $policy$
      CREATE POLICY "realtime_messages_participant_select"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (
          realtime.messages.extension IN ('broadcast', 'presence')
          AND (
            private.can_access_typing_topic((SELECT realtime.topic()))
            OR EXISTS (
              SELECT 1
              FROM public.viewings AS viewing
              WHERE viewing.id = public.uuid_from_realtime_topic(
                (SELECT realtime.topic()),
                'video:viewing'
              )
                AND viewing.viewing_type = 'video'::public.viewing_type
                AND viewing.status = 'confirmed'::public.viewing_status
                AND (
                  viewing.owner_id = (SELECT auth.uid())
                  OR viewing.requester_id = (SELECT auth.uid())
                )
            )
            OR EXISTS (
              SELECT 1
              FROM public.consultation_requests AS request
              JOIN public.professionals AS professional
                ON professional.id = request.professional_id
              WHERE request.id = public.uuid_from_realtime_topic(
                (SELECT realtime.topic()),
                'video:consultation'
              )
                AND request.request_type = 'consultation'
                AND request.status = 'confirmed'
                AND request.meeting_type = 'video'
                AND (
                  professional.user_id = (SELECT auth.uid())
                  OR request.requester_id = (SELECT auth.uid())
                )
            )
            OR EXISTS (
              SELECT 1
              FROM public.professionals AS professional
              WHERE professional.id = public.uuid_from_realtime_topic(
                (SELECT realtime.topic()),
                'video:professional'
              )
                AND professional.user_id = (SELECT auth.uid())
            )
          )
        )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "realtime_messages_participant_insert"
        ON realtime.messages
        FOR INSERT
        TO authenticated
        WITH CHECK (
          realtime.messages.extension IN ('broadcast', 'presence')
          AND (
            private.can_access_typing_topic((SELECT realtime.topic()))
            OR EXISTS (
              SELECT 1
              FROM public.viewings AS viewing
              WHERE viewing.id = public.uuid_from_realtime_topic(
                (SELECT realtime.topic()),
                'video:viewing'
              )
                AND viewing.viewing_type = 'video'::public.viewing_type
                AND viewing.status = 'confirmed'::public.viewing_status
                AND (
                  viewing.owner_id = (SELECT auth.uid())
                  OR viewing.requester_id = (SELECT auth.uid())
                )
            )
            OR EXISTS (
              SELECT 1
              FROM public.consultation_requests AS request
              JOIN public.professionals AS professional
                ON professional.id = request.professional_id
              WHERE request.id = public.uuid_from_realtime_topic(
                (SELECT realtime.topic()),
                'video:consultation'
              )
                AND request.request_type = 'consultation'
                AND request.status = 'confirmed'
                AND request.meeting_type = 'video'
                AND (
                  professional.user_id = (SELECT auth.uid())
                  OR request.requester_id = (SELECT auth.uid())
                )
            )
            OR EXISTS (
              SELECT 1
              FROM public.professionals AS professional
              WHERE professional.id = public.uuid_from_realtime_topic(
                (SELECT realtime.topic()),
                'video:professional'
              )
                AND professional.user_id = (SELECT auth.uid())
            )
          )
        )
    $policy$;
  ELSE
    RAISE NOTICE 'realtime.messages not present - skipping consolidated Realtime policies';
  END IF;
END;
$block$;

DO $block$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Firesale proof docs own read" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Message attachments are participant-readable" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Open house docs read owner or listing owner" ON storage.objects';

    EXECUTE 'DROP POLICY IF EXISTS "Admins can upload property images" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated can upload firesale photos" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated can upload message attachments" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can upload listing images" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Firesale proof docs own insert" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Open house docs upload own" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "project_media_insert" ON storage.objects';

    EXECUTE 'DROP POLICY IF EXISTS "Admins can update property images" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Firesale proof docs own update" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects';

    EXECUTE 'DROP POLICY IF EXISTS "Admins can delete property images" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Firesale proof docs own delete" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Open house docs delete own" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Owners can delete their message attachments" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete their listing images" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete their own firesale photos" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "project_media_delete" ON storage.objects';

    EXECUTE 'DROP POLICY IF EXISTS "storage_objects_authenticated_select" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "storage_objects_authenticated_insert" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "storage_objects_authenticated_update" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "storage_objects_authenticated_delete" ON storage.objects';

    EXECUTE $policy$
      CREATE POLICY "storage_objects_authenticated_select"
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
          (
            bucket_id = 'firesale-proof-docs'
            AND (
              (storage.foldername(name))[1] = (SELECT auth.uid())::text
              OR private.has_platform_admin((SELECT auth.uid()))
            )
          )
          OR (
            bucket_id = 'message-attachments'
            AND EXISTS (
              SELECT 1
              FROM public.conversations AS conversation
              WHERE conversation.id::text = (storage.foldername(storage.objects.name))[2]
                AND (
                  conversation.participant_a = (SELECT auth.uid())
                  OR conversation.participant_b = (SELECT auth.uid())
                )
            )
          )
          OR (
            bucket_id = 'open-house-docs'
            AND (
              (storage.foldername(name))[1] = (SELECT auth.uid())::text
              OR EXISTS (
                SELECT 1
                FROM public.open_house_registrations AS registration
                JOIN public.listings AS listing
                  ON listing.id = registration.listing_id
                 AND listing.owner_id = (SELECT auth.uid())
                WHERE (storage.foldername(storage.objects.name))[1] = registration.requester_id::text
                  AND (storage.foldername(storage.objects.name))[2] = registration.listing_id::text
              )
              OR private.has_platform_admin((SELECT auth.uid()))
            )
          )
        )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "storage_objects_authenticated_insert"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
          (
            bucket_id = 'property-images'
            AND private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
          )
          OR (
            bucket_id = 'firesale-photos'
            AND EXISTS (
              SELECT 1
              FROM public.firesale_requests AS request
              WHERE request.id::text = (storage.foldername(storage.objects.name))[1]
                AND request.user_id = (SELECT auth.uid())
            )
          )
          OR (
            bucket_id = 'message-attachments'
            AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
            AND EXISTS (
              SELECT 1
              FROM public.conversations AS conversation
              WHERE conversation.id::text = (storage.foldername(storage.objects.name))[2]
                AND (
                  conversation.participant_a = (SELECT auth.uid())
                  OR conversation.participant_b = (SELECT auth.uid())
                )
            )
          )
          OR (
            bucket_id = 'listing-images'
            AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
          )
          OR (
            bucket_id = 'firesale-proof-docs'
            AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
            AND (storage.foldername(name))[2] = 'firesale'
          )
          OR (
            bucket_id = 'open-house-docs'
            AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
          )
          OR (
            bucket_id = 'avatars'
            AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
          )
          OR (
            bucket_id = 'project-media'
            AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
          )
        )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "storage_objects_authenticated_update"
        ON storage.objects
        FOR UPDATE
        TO authenticated
        USING (
          (
            bucket_id = 'property-images'
            AND private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
          )
          OR (
            bucket_id = 'firesale-proof-docs'
            AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
            AND (storage.foldername(name))[2] = 'firesale'
          )
          OR (
            bucket_id = 'avatars'
            AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
          )
        )
        WITH CHECK (
          (
            bucket_id = 'property-images'
            AND private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
          )
          OR (
            bucket_id = 'firesale-proof-docs'
            AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
            AND (storage.foldername(name))[2] = 'firesale'
          )
          OR (
            bucket_id = 'avatars'
            AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
          )
        )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "storage_objects_authenticated_delete"
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (
          (
            bucket_id = 'property-images'
            AND private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
          )
          OR (
            bucket_id = 'firesale-proof-docs'
            AND (
              (storage.foldername(name))[1] = (SELECT auth.uid())::text
              OR private.has_platform_admin((SELECT auth.uid()))
            )
          )
          OR (
            bucket_id = 'open-house-docs'
            AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
          )
          OR (
            bucket_id = 'message-attachments'
            AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
          )
          OR (
            bucket_id = 'listing-images'
            AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
          )
          OR (
            bucket_id = 'firesale-photos'
            AND (
              EXISTS (
                SELECT 1
                FROM public.firesale_requests AS request
                WHERE request.id::text = (storage.foldername(storage.objects.name))[1]
                  AND request.user_id = (SELECT auth.uid())
              )
              OR private.has_platform_admin((SELECT auth.uid()))
            )
          )
          OR (
            bucket_id = 'project-media'
            AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
          )
        )
    $policy$;
  ELSE
    RAISE NOTICE 'storage.objects not present - skipping consolidated Storage policies';
  END IF;
END;
$block$;

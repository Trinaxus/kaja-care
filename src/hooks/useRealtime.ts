import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export function useRealtimeSubscription(
  table: string,
  callback: () => void,
  filter?: { column: string; value: string }
) {
  useEffect(() => {
    let channel: RealtimeChannel;

    const setupSubscription = () => {
      let subscription = supabase
        .channel(`${table}-changes`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: table,
            ...(filter && { filter: `${filter.column}=eq.${filter.value}` })
          },
          () => {
            callback();
          }
        );

      channel = subscription.subscribe();
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [table, callback, filter]);
}

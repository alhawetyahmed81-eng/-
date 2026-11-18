import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    let removeCapListener: (() => Promise<void>) | null = null;
    if (Capacitor.isNativePlatform()) {
      void Network.getStatus()
        .then((status) => setIsOnline(status.connected))
        .catch(() => {});
      void Network.addListener('networkStatusChange', (status) => {
        setIsOnline(status.connected);
      }).then((handle) => {
        removeCapListener = () => handle.remove();
      });
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (removeCapListener) {
        void removeCapListener();
      }
    };
  }, []);

  return isOnline;
}

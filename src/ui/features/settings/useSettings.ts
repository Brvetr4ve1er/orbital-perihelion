import { useEffect, useState } from 'react';
import { settingsStore, Settings } from '../../../services/settings';

export function useSettings(): Settings {
    const [s, setS] = useState<Settings>(settingsStore.getState());
    useEffect(() => settingsStore.subscribe(setS), []);
    return s;
}

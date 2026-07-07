import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PROFILE, getProfile, saveProfile, type PersonalProfile } from "../lib/localDb";

export function useProfile() {
  const [profile, setProfile] = useState<PersonalProfile>(DEFAULT_PROFILE);
  const [profileError, setProfileError] = useState<string | null>(null);

  const reloadProfile = useCallback(async () => {
    try {
      setProfile(await getProfile());
      setProfileError(null);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "个人档案读取失败。");
    }
  }, []);

  const updateProfile = useCallback(async (nextProfile: PersonalProfile) => {
    setProfile(nextProfile);
    try {
      await saveProfile(nextProfile);
      setProfile(await getProfile());
      setProfileError(null);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "个人档案保存失败。");
    }
  }, []);

  useEffect(() => {
    void reloadProfile();
  }, [reloadProfile]);

  return {
    profile,
    profileError,
    updateProfile,
    reloadProfile,
  };
}

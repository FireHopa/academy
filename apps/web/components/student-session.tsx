"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

export type StudentProfile = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  onboardingCompletedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export type StudentNotification = {
  id: string;
  title: string;
  message: string;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

type StudentSessionValue = {
  profile: StudentProfile | null;
  profileLoading: boolean;
  profileError: string;
  notifications: StudentNotification[];
  unread: number;
  refreshProfile: () => Promise<StudentProfile>;
  updateProfile: (patch: Partial<StudentProfile>) => void;
  refreshNotifications: () => Promise<void>;
  readNotification: (id: string) => Promise<void>;
  readAllNotifications: () => Promise<void>;
};

const StudentSessionContext = createContext<StudentSessionValue | null>(null);

export function StudentSessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [notifications, setNotifications] = useState<StudentNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const refreshProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError("");
    try {
      const result = await apiFetch<{ user: StudentProfile }>("/account/profile");
      setProfile(result.user);
      return result.user;
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Não foi possível carregar o perfil");
      throw error;
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    const result = await apiFetch<{ unread: number; notifications: StudentNotification[] }>("/experience/notifications/summary");
    setUnread(result.unread);
    setNotifications(result.notifications);
  }, []);

  const updateProfile = useCallback((patch: Partial<StudentProfile>) => {
    setProfile(current => current ? { ...current, ...patch } : current);
  }, []);

  const readNotification = useCallback(async (id: string) => {
    const target = notifications.find(item => item.id === id);
    if (!target || target.readAt) return;
    const now = new Date().toISOString();
    setNotifications(current => current.map(item => item.id === id ? { ...item, readAt: now } : item));
    setUnread(current => Math.max(0, current - 1));
    try {
      await apiFetch(`/experience/notifications/${id}/read`, { method: "POST" });
    } catch (error) {
      await refreshNotifications().catch(() => undefined);
      throw error;
    }
  }, [notifications, refreshNotifications]);

  const readAllNotifications = useCallback(async () => {
    const previousNotifications = notifications;
    const previousUnread = unread;
    const now = new Date().toISOString();
    setNotifications(current => current.map(item => ({ ...item, readAt: item.readAt || now })));
    setUnread(0);
    try {
      await apiFetch("/experience/notifications/read-all", { method: "POST" });
    } catch (error) {
      setNotifications(previousNotifications);
      setUnread(previousUnread);
      throw error;
    }
  }, [notifications, unread]);

  useEffect(() => {
    void refreshProfile().catch(() => undefined);
    void refreshNotifications().catch(() => undefined);
    const timer = window.setInterval(() => void refreshNotifications().catch(() => undefined), 60_000);
    return () => window.clearInterval(timer);
  }, [refreshNotifications, refreshProfile]);

  const value = useMemo<StudentSessionValue>(() => ({
    profile,
    profileLoading,
    profileError,
    notifications,
    unread,
    refreshProfile,
    updateProfile,
    refreshNotifications,
    readNotification,
    readAllNotifications,
  }), [profile, profileLoading, profileError, notifications, unread, refreshProfile, updateProfile, refreshNotifications, readNotification, readAllNotifications]);

  return <StudentSessionContext.Provider value={value}>{children}</StudentSessionContext.Provider>;
}

export function useStudentSession() {
  const value = useContext(StudentSessionContext);
  if (!value) throw new Error("useStudentSession deve ser usado dentro da área do aluno");
  return value;
}

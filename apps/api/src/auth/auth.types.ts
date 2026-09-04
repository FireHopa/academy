export type AuthUser = {
  sub: string;
  email: string;
  name: string;
  role: "STUDENT" | "INSTRUCTOR" | "ADMIN";
  ver: number;
  onboardingCompleted: boolean;
};

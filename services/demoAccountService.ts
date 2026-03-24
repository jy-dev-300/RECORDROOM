import demoAccount from "../data/demoaccount.json";

export type DemoAccount = {
  id: string;
  displayName: string;
  username: string;
  email: string;
  plan: string;
  avatarColor: string;
};

export async function loadDemoAccount() {
  return demoAccount as DemoAccount;
}

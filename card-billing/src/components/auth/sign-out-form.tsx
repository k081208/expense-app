import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

/** ログアウトボタン。Server Action によるフォーム送信で動く。 */
export function SignOutForm() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="quiet">
        ログアウト
      </Button>
    </form>
  );
}

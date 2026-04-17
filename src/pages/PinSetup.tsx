import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { setupPin, hasPinOnDevice } from "@/lib/devicePin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function PinSetup() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [user, loading, navigate]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin !== confirm) {
      toast.error("PIN ไม่ตรงกัน");
      return;
    }
    if (!user) return;

    setBusy(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("access_key")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile) throw new Error("ไม่พบ profile");
      await setupPin({
        userId: user.id,
        email: user.email!,
        accessKey: profile.access_key,
        pin,
      });
      toast.success("ตั้ง PIN สำเร็จ — ครั้งหน้าใช้ PIN นี้เข้าใช้งานได้เลย");
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "ตั้ง PIN ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md card-shadow rounded-xl border border-border bg-card p-8">
        <h1 className="font-display text-2xl font-bold text-gold-gradient text-center mb-1">
          ตั้ง PIN ครั้งแรก
        </h1>
        <p className="text-center text-xs text-muted-foreground mb-6">
          ใช้ PIN เข้าใช้งานครั้งถัดไปบนเครื่องนี้ (ไม่ต้องพิมพ์ Access Key)
        </p>

        {hasPinOnDevice() && (
          <div className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold">
            มี PIN เดิมบนเครื่องนี้แล้ว — การตั้งใหม่จะแทนที่ของเดิม
          </div>
        )}

        <form onSubmit={handleSetup} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              ตั้ง PIN 6 หลัก
            </label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="text-center text-2xl tracking-[0.5em] font-mono"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              ยืนยัน PIN
            </label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
              className="text-center text-2xl tracking-[0.5em] font-mono"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => navigate("/")}
            >
              ข้าม
            </Button>
            <Button
              type="submit"
              disabled={busy || pin.length !== 6 || confirm.length !== 6}
              className="flex-1"
            >
              {busy ? "กำลังตั้ง..." : "ตั้ง PIN"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

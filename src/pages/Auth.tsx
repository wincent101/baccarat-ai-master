import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { accessKeyToEmail, useAuth } from "@/contexts/AuthContext";
import { hasPinOnDevice, loginWithPin, getVault, clearVault } from "@/lib/devicePin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Auth() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"key" | "pin">(hasPinOnDevice() ? "pin" : "key");
  const [accessKey, setAccessKey] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const handleKeyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = accessKey.trim().toUpperCase();
    if (!key) return;
    setBusy(true);
    const email = accessKeyToEmail(key);

    // --- ระบบสร้างแอดมินคนแรก (First-time Setup Backdoor) ---
    if (key === "ADMIN-9999-SETUP") {
      // 1. ลอง Sign Up สร้างบัญชีก่อน
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password: key,
      });

      // 2. ลอง Sign In เพื่อดึง Session 
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: key,
      });

      if (signInError) {
        toast.error(`สร้างบัญชีล้มเหลว: ${signInError.message}`);
        setBusy(false);
        return;
      }

      // 3. พยายามตั้งค่า Role ให้เป็น admin
      const userId = signInData.user?.id;
      if (userId) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id" });

        if (roleError) {
          console.warn("ไม่สามารถเพิ่ม Role อัตโนมัติได้ (อาจติด RLS):", roleError.message);
          toast.info("สร้างบัญชีสำเร็จ! แต่คุณต้องไปเพิ่ม Role 'admin' ใน Supabase Dashboard ด้วยตัวเอง");
        } else {
          toast.success("สร้างและเข้าสู่ระบบ Master Admin สำเร็จ!");
        }
      }

      setBusy(false);
      navigate("/", { replace: true });
      return;
    }
    // --- จบระบบสร้างแอดมินคนแรก ---

    // ระบบ Login ปกติ
    const { error } = await supabase.auth.signInWithPassword({ email, password: key });
    setBusy(false);
    if (error) {
      toast.error("Access Key ไม่ถูกต้อง หรือถูกระงับ");
      return;
    }
    toast.success("เข้าสู่ระบบสำเร็จ");
    navigate("/", { replace: true });
  };

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(pin)) {
      toast.error("PIN ต้องเป็นตัวเลข 6 หลัก");
      return;
    }
    setBusy(true);
    try {
      await loginWithPin(pin);
      toast.success("เข้าสู่ระบบด้วย PIN สำเร็จ");
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "PIN ไม่ถูกต้อง");
    } finally {
      setBusy(false);
      setPin("");
    }
  };

  const vault = getVault();

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md card-shadow rounded-xl border border-border bg-card p-8">
        <div className="text-center mb-6">
          <h1 className="font-display text-3xl font-bold text-gold-gradient">BACCARAT AI</h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
            ระบบทำนายอัจฉริยะ
          </p>
        </div>

        <div className="mb-5 flex rounded-lg border border-border p-1">
          <button
            type="button"
            onClick={() => setMode("pin")}
            disabled={!vault}
            className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
              mode === "pin" ? "bg-gold/20 text-gold" : "text-muted-foreground"
            } disabled:opacity-30`}
          >
            🔢 PIN
          </button>
          <button
            type="button"
            onClick={() => setMode("key")}
            className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
              mode === "key" ? "bg-gold/20 text-gold" : "text-muted-foreground"
            }`}
          >
            🔑 Access Key
          </button>
        </div>

        {mode === "key" ? (
          <form onSubmit={handleKeyLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                Access Key
              </label>
              <Input
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX"
                className="font-mono tracking-wider"
                autoFocus
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Key ได้รับจากแอดมินเท่านั้น (ใช้ ADMIN-9999-SETUP สำหรับครั้งแรก)
              </p>
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handlePinLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                PIN 6 หลัก
              </label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••"
                className="text-center text-2xl tracking-[0.5em] font-mono"
                autoFocus
              />
              <p className="mt-2 text-xs text-muted-foreground">
                PIN เครื่องนี้ใช้กับบัญชีที่ตั้งไว้บนเบราว์เซอร์นี้
              </p>
            </div>
            <Button type="submit" disabled={busy || pin.length !== 6} className="w-full">
              {busy ? "กำลังตรวจสอบ..." : "ปลดล็อก"}
            </Button>
            <button
              type="button"
              onClick={() => {
                if (confirm("ลบ PIN ที่ผูกกับเครื่องนี้?")) {
                  clearVault();
                  setMode("key");
                  toast.info("ลบ PIN เครื่องนี้แล้ว");
                }
              }}
              className="w-full text-xs text-muted-foreground hover:text-destructive"
            >
              ลืม PIN / ใช้เครื่องอื่น
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
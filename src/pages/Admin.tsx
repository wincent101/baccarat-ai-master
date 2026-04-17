import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface UserRow {
  user_id: string;
  access_key: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  is_admin?: boolean;
  log_count?: number;
}

export default function Admin() {
  const navigate = useNavigate();
  const { user, role, loading, signOut } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || role !== "admin")) {
      toast.error("เฉพาะแอดมินเท่านั้น");
      navigate("/", { replace: true });
    }
  }, [user, role, loading, navigate]);

  const load = useCallback(async () => {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, access_key, display_name, is_active, created_at")
      .order("created_at", { ascending: false });

    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const adminSet = new Set(roles?.filter((r) => r.role === "admin").map((r) => r.user_id));

    // counts
    const counts: Record<string, number> = {};
    if (profiles) {
      for (const p of profiles) {
        const { count } = await supabase
          .from("training_logs")
          .select("*", { count: "exact", head: true })
          .eq("user_id", p.user_id);
        counts[p.user_id] = count || 0;
      }
    }

    setUsers(
      (profiles || []).map((p) => ({
        ...p,
        is_admin: adminSet.has(p.user_id),
        log_count: counts[p.user_id] || 0,
      }))
    );
  }, []);

  useEffect(() => {
    if (role === "admin") load();
  }, [role, load]);

  const callAdmin = async (body: any) => {
    const { data, error } = await supabase.functions.invoke("admin-create-user", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleCreate = async () => {
    setBusy(true);
    try {
      const res = await callAdmin({ action: "create_user", display_name: displayName });
      setNewKey(res.access_key);
      setDisplayName("");
      toast.success(`สร้างผู้ใช้สำเร็จ — Access Key: ${res.access_key}`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (u: UserRow) => {
    try {
      await callAdmin({ action: "set_active", user_id: u.user_id, is_active: !u.is_active });
      toast.success(u.is_active ? "ระงับการใช้งานแล้ว" : "เปิดใช้งานแล้ว");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (u: UserRow) => {
    if (!confirm(`ลบผู้ใช้ ${u.display_name || u.access_key}? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    try {
      await callAdmin({ action: "delete_user", user_id: u.user_id });
      toast.success("ลบผู้ใช้แล้ว");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleResetPins = async (u: UserRow) => {
    if (!confirm("รีเซ็ต PIN ทั้งหมดของผู้ใช้นี้?")) return;
    try {
      await callAdmin({ action: "reset_pins", user_id: u.user_id });
      toast.success("รีเซ็ต PIN แล้ว");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handlePromote = async (u: UserRow) => {
    if (!confirm(`เลื่อน ${u.display_name || u.access_key} เป็นแอดมิน?`)) return;
    try {
      await callAdmin({ action: "promote_admin", user_id: u.user_id });
      toast.success("เลื่อนเป็นแอดมินแล้ว");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading || role !== "admin") return null;

  return (
    <div className="min-h-screen px-4 py-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold text-gold-gradient">Admin Panel</h1>
            <p className="text-xs text-muted-foreground mt-1">จัดการผู้ใช้และ Access Key</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/")}>
              ← กลับหน้าหลัก
            </Button>
            <Button variant="outline" onClick={signOut}>
              ออกจากระบบ
            </Button>
          </div>
        </div>

        <div className="card-shadow mb-6 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold">
            ➕ สร้าง Access Key ใหม่
          </h2>
          <div className="flex gap-2">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="ชื่อผู้ใช้ (ไม่บังคับ)"
            />
            <Button onClick={handleCreate} disabled={busy}>
              {busy ? "กำลังสร้าง..." : "สร้าง"}
            </Button>
          </div>
          {newKey && (
            <div className="mt-3 rounded-md border border-gold/40 bg-gold/10 px-4 py-3">
              <p className="text-xs text-muted-foreground">Access Key ใหม่ (คัดลอกและส่งให้ผู้ใช้):</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <code className="font-mono text-xl tracking-wider text-gold">{newKey}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(newKey);
                    toast.success("คัดลอกแล้ว");
                  }}
                >
                  คัดลอก
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="card-shadow rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold">
            👥 ผู้ใช้ทั้งหมด ({users.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">ชื่อ</th>
                  <th className="py-2">Access Key</th>
                  <th className="py-2">สถานะ</th>
                  <th className="py-2">บทบาท</th>
                  <th className="py-2 text-right">Logs</th>
                  <th className="py-2 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.user_id} className="border-b border-border/50">
                    <td className="py-2">{u.display_name || <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-2 font-mono text-xs text-gold">{u.access_key}</td>
                    <td className="py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          u.is_active
                            ? "bg-casino-green/20 text-casino-green"
                            : "bg-destructive/20 text-destructive"
                        }`}
                      >
                        {u.is_active ? "ใช้งาน" : "ระงับ"}
                      </span>
                    </td>
                    <td className="py-2 text-xs">
                      {u.is_admin ? (
                        <span className="text-gold font-semibold">ADMIN</span>
                      ) : (
                        <span className="text-muted-foreground">user</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{u.log_count}</td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleToggleActive(u)}>
                          {u.is_active ? "ระงับ" : "เปิด"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleResetPins(u)}>
                          รีเซ็ต PIN
                        </Button>
                        {!u.is_admin && (
                          <Button size="sm" variant="ghost" onClick={() => handlePromote(u)}>
                            ตั้งแอดมิน
                          </Button>
                        )}
                        {u.user_id !== user!.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(u)}
                          >
                            ลบ
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      ยังไม่มีผู้ใช้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

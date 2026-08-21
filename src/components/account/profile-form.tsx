"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { FormField, FormTextarea } from "@/components/ui/form-field";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import type { SafeUser } from "@/modules/users/domain/serialization";

interface ProfileValues {
  displayName: string;
  bio: string | null;
}

export function ProfileForm() {
  const router = useRouter();
  const [notice, setNotice] = useState<string>();
  const [profileReady, setProfileReady] = useState(false);
  const [username, setUsername] = useState("");
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>();

  useEffect(() => {
    void apiRequest<{ user: SafeUser }>("/api/v1/me")
      .then(({ user }) => {
        setUsername(user.username);
        reset({ displayName: user.displayName, bio: user.bio });
        setProfileReady(true);
      })
      .catch(() =>
        setNotice("Profil bilgileri yüklenemedi. Lütfen giriş yaptığınızdan emin olun."),
      );
  }, [reset]);

  const submit = async (input: ProfileValues) => {
    setNotice(undefined);
    try {
      await apiRequest("/api/v1/me", { method: "PATCH", body: input, csrf: true });
      router.refresh();
      setNotice("Profiliniz güncellendi.");
    } catch (error) {
      setNotice(error instanceof ClientApiError ? error.message : "Profil güncellenemedi.");
    }
  };

  /* Bölüm başlığı yükleme dalında da var: sayfa iki adlandırılmış bölüm
     ("Profil bilgileri" ve "Görünüm") olarak okunuyor, profil yüklenirken üstteki kart
     adsız kalırsa "Görünüm" tek başlıklı bölüm gibi duruyordu. */
  if (!profileReady) {
    return (
      <section className="surface-card p-6" aria-labelledby="profil-bolumu">
        <h2 id="profil-bolumu" className="title-section">
          Profil bilgileri
        </h2>
        <p role={notice ? "alert" : "status"} className="mt-1 text-sm text-muted">
          {notice ?? "Profil bilgileri yükleniyor…"}
        </p>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(submit)}
      className="surface-card space-y-4 p-6"
      aria-labelledby="profil-bolumu"
      noValidate
    >
      <h2 id="profil-bolumu" className="title-section">
        Profil bilgileri
      </h2>
      <FormField
        id="settings-username"
        label="Kullanıcı adı"
        value={username ? `@${username}` : "Yükleniyor…"}
        disabled
        hint="Kullanıcı adı değiştirilemez."
      />
      <FormField
        id="settings-display-name"
        label="Görünen ad"
        disabled={isSubmitting}
        error={errors.displayName?.message}
        {...register("displayName", {
          required: "Görünen ad zorunludur.",
          minLength: { value: 2, message: "En az 2 karakter girin." },
          maxLength: { value: 50, message: "En fazla 50 karakter girin." },
        })}
      />
      <FormTextarea
        id="settings-bio"
        label="Hakkında"
        maxLength={500}
        disabled={isSubmitting}
        error={errors.bio?.message}
        hint="En fazla 500 karakter."
        {...register("bio", { maxLength: { value: 500, message: "En fazla 500 karakter girin." } })}
      />
      {notice ? (
        <p role="status" className="rounded-lg bg-primary/10 px-4 py-3 text-sm">
          {notice}
        </p>
      ) : null}
      <button type="submit" disabled={isSubmitting} className="button-primary">
        {isSubmitting ? "Kaydediliyor…" : "Profili kaydet"}
      </button>
    </form>
  );
}

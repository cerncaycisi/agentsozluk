"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/ui/form-field";
import { apiRequest, ClientApiError } from "@/lib/http/client";

interface EmailValues {
  email: string;
  currentPassword: string;
}
interface PasswordValues {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirmation: string;
}
interface DeactivationValues {
  currentPassword: string;
  usernameConfirmation: string;
}

function Notice({ message }: { message?: string | undefined }) {
  return message ? (
    <p role="status" className="rounded-xl bg-primary/10 px-4 py-3 text-sm">
      {message}
    </p>
  ) : null;
}

export function SecurityForms() {
  const router = useRouter();
  const [emailNotice, setEmailNotice] = useState<string>();
  const [passwordNotice, setPasswordNotice] = useState<string>();
  const [deactivationNotice, setDeactivationNotice] = useState<string>();
  const emailForm = useForm<EmailValues>();
  const passwordForm = useForm<PasswordValues>();
  const deactivationForm = useForm<DeactivationValues>();

  const changeEmail = emailForm.handleSubmit(async (input) => {
    setEmailNotice(undefined);
    try {
      await apiRequest("/api/v1/me/email", { method: "POST", body: input, csrf: true });
      emailForm.reset();
      setEmailNotice(
        "E-posta adresiniz değiştirildi. Bu sürümde e-posta doğrulaması kullanılmıyor.",
      );
    } catch (error) {
      setEmailNotice(error instanceof ClientApiError ? error.message : "E-posta değiştirilemedi.");
    }
  });

  const changePassword = passwordForm.handleSubmit(async (input) => {
    setPasswordNotice(undefined);
    if (input.newPassword !== input.newPasswordConfirmation) {
      passwordForm.setError("newPasswordConfirmation", { message: "Yeni şifreler eşleşmiyor." });
      return;
    }
    try {
      await apiRequest("/api/v1/me/password", { method: "POST", body: input, csrf: true });
      passwordForm.reset();
      setPasswordNotice("Şifreniz değiştirildi; bu oturum dışındaki oturumlar kapatıldı.");
    } catch (error) {
      setPasswordNotice(error instanceof ClientApiError ? error.message : "Şifre değiştirilemedi.");
    }
  });

  const deactivate = deactivationForm.handleSubmit(async (input) => {
    setDeactivationNotice(undefined);
    try {
      await apiRequest("/api/v1/me/deactivate", { method: "POST", body: input, csrf: true });
      router.replace("/");
      router.refresh();
    } catch (error) {
      setDeactivationNotice(
        error instanceof ClientApiError ? error.message : "Hesap kapatılamadı.",
      );
    }
  });

  return (
    <div className="space-y-6">
      <form onSubmit={changeEmail} className="surface-card space-y-5 p-6" noValidate>
        <div>
          <h2 className="text-xl font-black">E-posta değiştir</h2>
          <p className="mt-1 text-sm text-muted">
            Yeni adres hemen etkinleşir; Milestone 1’de e-posta doğrulaması yoktur.
          </p>
        </div>
        <FormField
          id="security-email"
          type="email"
          autoComplete="email"
          label="Yeni e-posta"
          disabled={emailForm.formState.isSubmitting}
          error={emailForm.formState.errors.email?.message}
          {...emailForm.register("email", { required: "E-posta zorunludur." })}
        />
        <FormField
          id="security-email-password"
          type="password"
          autoComplete="current-password"
          label="Mevcut şifre"
          disabled={emailForm.formState.isSubmitting}
          error={emailForm.formState.errors.currentPassword?.message}
          {...emailForm.register("currentPassword", { required: "Mevcut şifrenizi girin." })}
        />
        <Notice message={emailNotice} />
        <button
          type="submit"
          disabled={emailForm.formState.isSubmitting}
          className="button-primary"
        >
          {emailForm.formState.isSubmitting ? "Değiştiriliyor…" : "E-postayı değiştir"}
        </button>
      </form>

      <form onSubmit={changePassword} className="surface-card space-y-5 p-6" noValidate>
        <div>
          <h2 className="text-xl font-black">Şifre değiştir</h2>
          <p className="mt-1 text-sm text-muted">
            İşlemden sonra mevcut oturumunuz açık kalır, diğerleri kapanır.
          </p>
        </div>
        <FormField
          id="security-current-password"
          type="password"
          autoComplete="current-password"
          label="Mevcut şifre"
          disabled={passwordForm.formState.isSubmitting}
          error={passwordForm.formState.errors.currentPassword?.message}
          {...passwordForm.register("currentPassword", { required: "Mevcut şifrenizi girin." })}
        />
        <FormField
          id="security-new-password"
          type="password"
          autoComplete="new-password"
          label="Yeni şifre"
          hint="En az 10 karakter, bir harf ve bir rakam."
          disabled={passwordForm.formState.isSubmitting}
          error={passwordForm.formState.errors.newPassword?.message}
          {...passwordForm.register("newPassword", {
            required: "Yeni şifre zorunludur.",
            minLength: { value: 10, message: "En az 10 karakter girin." },
          })}
        />
        <FormField
          id="security-new-password-confirmation"
          type="password"
          autoComplete="new-password"
          label="Yeni şifre tekrarı"
          disabled={passwordForm.formState.isSubmitting}
          error={passwordForm.formState.errors.newPasswordConfirmation?.message}
          {...passwordForm.register("newPasswordConfirmation", {
            required: "Yeni şifreyi tekrar girin.",
          })}
        />
        <Notice message={passwordNotice} />
        <button
          type="submit"
          disabled={passwordForm.formState.isSubmitting}
          className="button-primary"
        >
          {passwordForm.formState.isSubmitting ? "Değiştiriliyor…" : "Şifreyi değiştir"}
        </button>
      </form>

      <form
        id="deactivation-form"
        onSubmit={deactivate}
        className="surface-card space-y-5 border-destructive/40 p-6"
        noValidate
      >
        <div>
          <h2 className="text-xl font-black text-destructive">Hesabı kalıcı olarak kapat</h2>
          <p className="mt-1 text-sm text-muted">
            Entry’ler korunur; hesabınız anonimleştirilir ve yeniden giriş yapılamaz.
          </p>
        </div>
        <FormField
          id="deactivate-username"
          label="Kullanıcı adınız"
          hint="Onay için kullanıcı adınızı eksiksiz yazın."
          disabled={deactivationForm.formState.isSubmitting}
          error={deactivationForm.formState.errors.usernameConfirmation?.message}
          {...deactivationForm.register("usernameConfirmation", {
            required: "Kullanıcı adınızı yazın.",
          })}
        />
        <FormField
          id="deactivate-password"
          type="password"
          autoComplete="current-password"
          label="Mevcut şifre"
          disabled={deactivationForm.formState.isSubmitting}
          error={deactivationForm.formState.errors.currentPassword?.message}
          {...deactivationForm.register("currentPassword", { required: "Mevcut şifrenizi girin." })}
        />
        <Notice message={deactivationNotice} />
        <AlertDialog.Root>
          <AlertDialog.Trigger asChild>
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-xl bg-destructive px-5 py-2.5 font-semibold text-white"
            >
              Hesabı kapat
            </button>
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-black/60" />
            <AlertDialog.Content className="surface-card fixed left-1/2 top-1/2 z-[90] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 p-6">
              <AlertDialog.Title className="text-xl font-black">
                Hesabınızı kapatmak istediğinize emin misiniz?
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-3 leading-7 text-muted">
                Bu işlem geri alınamaz. Profiliniz anonimleşir, bütün oturumlarınız kapanır; mevcut
                entry’leriniz içerik bütünlüğü için korunur.
              </AlertDialog.Description>
              <div className="mt-6 flex justify-end gap-3">
                <AlertDialog.Cancel asChild>
                  <button type="button" className="button-secondary">
                    Vazgeç
                  </button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <button
                    type="submit"
                    form="deactivation-form"
                    disabled={deactivationForm.formState.isSubmitting}
                    className="inline-flex min-h-11 items-center rounded-xl bg-destructive px-5 py-2.5 font-semibold text-white disabled:opacity-50"
                  >
                    {deactivationForm.formState.isSubmitting
                      ? "Kapatılıyor…"
                      : "Evet, hesabı kapat"}
                  </button>
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </form>
    </div>
  );
}

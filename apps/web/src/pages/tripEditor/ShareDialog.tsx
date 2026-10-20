import { Shares, type Trip } from "@wayline/domain";
import { Button, Dialog, IconButton, Input } from "@wayline/ui";
import { Info, Mail, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetShares, useShares } from "../../data/queries";

export type ShareDialogProps = {
  trip: Trip;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** The owner adds and removes friends who can view the trip. */
export function ShareDialog({ trip, open, onOpenChange }: ShareDialogProps) {
  const { t } = useTranslation("tripEditor");
  const shares = useShares(trip.id, open);
  const setShares = useSetShares(trip.id);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const emails = shares.data ?? trip.sharedWith;

  const save = (next: string[], onSuccess?: () => void) =>
    setShares.mutate(next, {
      onSuccess,
      onError: () => setError(t("share.failed")),
    });

  const add = (event: FormEvent) => {
    event.preventDefault();
    const parsed = Shares.safeParse({ emails: [email.trim()] });
    const value = parsed.data?.emails[0];
    if (!value) return setError(t("share.invalid"));
    if (value === trip.owner) return setError(t("share.self"));
    setError(undefined);
    if (emails.includes(value)) return setEmail("");
    save([...emails, value], () => setEmail(""));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("share.title")}
      description={t("share.text")}
      footer={
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          {t("share.done")}
        </Button>
      }
    >
      <form onSubmit={add} noValidate className="flex flex-col gap-1.5">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input
              label={t("share.email")}
              type="email"
              autoComplete="email"
              placeholder={t("share.placeholder")}
              value={email}
              aria-invalid={!!error}
              aria-describedby={error ? "share-error" : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(undefined);
              }}
            />
          </div>
          <Button type="submit" disabled={setShares.isPending}>
            {t("share.add")}
          </Button>
        </div>
        {error && (
          <span id="share-error" className="text-xs text-danger">
            {error}
          </span>
        )}
      </form>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-sm font-bold">{t("share.sharedWith")}</h3>
        {emails.length === 0 ? (
          <p className="text-sm text-text-muted">{t("share.none")}</p>
        ) : (
          <ul className="flex flex-col">
            {emails.map((address) => (
              <li
                key={address}
                className="flex items-center gap-2 border-b border-border py-1 last:border-b-0"
              >
                <Mail className="size-4 shrink-0 text-text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {address}
                </span>
                <IconButton
                  size="sm"
                  label={t("share.remove", { email: address })}
                  icon={<X aria-hidden />}
                  disabled={setShares.isPending}
                  onClick={() => save(emails.filter((e) => e !== address))}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex gap-2 text-xs text-text-muted">
        <Info className="size-3.5 shrink-0" aria-hidden />
        {t("share.accessNote")}
      </p>
    </Dialog>
  );
}

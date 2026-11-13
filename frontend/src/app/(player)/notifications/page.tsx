import { getTranslations } from "next-intl/server";

import { getServerApiClient } from "@/lib/api/server";
import { Card, CardContent } from "@/components/ui/card";
import { NotificationLink } from "@/components/layout/notification-link";

export const metadata = { title: "Notifications · ChampHub" };

export default async function NotificationsPage() {
  const api = await getServerApiClient();
  const { data } = await api.GET("/api/v1/me/notifications");

  const t = await getTranslations("notifications");
  const items = data?.results ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">{t("heading")}</h1>

      {items.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const body = (
              <>
                <div className="flex items-start gap-2">
                  {!item.is_read && (
                    <span aria-hidden className="bg-primary mt-2 size-1.5 shrink-0 rounded-full" />
                  )}
                  <p className={item.is_read ? "text-muted-foreground" : "font-medium"}>
                    {item.title}
                  </p>
                </div>
                {item.body && (
                  <p className="text-muted-foreground mt-1 pl-3.5 text-sm">{item.body}</p>
                )}
              </>
            );

            return (
              <li key={item.id}>
                {item.url ? (
                  <NotificationLink
                    url={item.url}
                    className="bg-card hover:bg-muted/40 block rounded-lg border p-3 transition-colors"
                  >
                    {body}
                  </NotificationLink>
                ) : (
                  <div className="bg-card rounded-lg border p-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

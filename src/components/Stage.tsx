import { AvatarApp } from "@/components/AvatarApp";
import { DidEmbedStage } from "@/components/avatar/DidEmbedStage";
import type { PublicAvatarConfig } from "@/components/avatar/types";
import { getSettings } from "@/lib/server/settings";

/** Shared by "/" and "/kiosk". */
export async function Stage({ kiosk }: { kiosk: boolean }) {
  let settings;
  try {
    settings = await getSettings();
  } catch (error) {
    console.error("[home] settings unavailable", error);
    return (
      <main className="stage-bg flex min-h-dvh items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-xl font-bold">سرویس در دسترس نیست</h1>
          <p className="text-muted">اتصال به پایگاه داده برقرار نشد. اگر مدیر سامانه هستید، متغیر DATABASE_URL را بررسی کنید.</p>
        </div>
      </main>
    );
  }

  const { avatar, persona, conversation, ui } = settings;
  const b = avatar.builtin;
  const asset = (id: string | null) => (id ? `/api/assets/${id}` : null);
  const hasMouths = Boolean(b.portraitAssetId && b.mouthSoftAssetId && b.mouthRoundAssetId && b.mouthOpenAssetId);

  // Only what the browser needs — no provider ids, keys or prompts.
  const avatarConfig: PublicAvatarConfig = {
    type: avatar.type,
    portraitUrl: asset(b.portraitAssetId),
    mouthUrls: hasMouths
      ? { soft: asset(b.mouthSoftAssetId)!, round: asset(b.mouthRoundAssetId)!, open: asset(b.mouthOpenAssetId)! }
      : null,
    mouthBox: b.mouthBox,
    ...(avatar.type === "did_embed" ? { didEmbed: avatar.didEmbed } : {}),
  };

  if (avatarConfig.type === "did_embed" && avatarConfig.didEmbed) {
    return <DidEmbedStage config={avatarConfig.didEmbed} title={ui.title} kiosk={kiosk} />;
  }

  return (
    <AvatarApp
      avatar={avatarConfig}
      title={ui.title}
      subtitle={ui.subtitle}
      name={persona.name}
      options={{ ...conversation, greetOnStart: persona.greetOnStart }}
      kiosk={kiosk}
    />
  );
}

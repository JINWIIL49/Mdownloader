import { Downloader } from "@/components/site/Downloader";
import { History } from "@/components/site/History";
import { PageShell } from "@/components/site/PageShell";

const TikTok = () => (
  <PageShell>
    <Downloader />
    <History />
  </PageShell>
);

export default TikTok;

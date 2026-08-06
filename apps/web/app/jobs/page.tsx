import { JobsView } from "../components/jobs-view";
import { fetchJobs } from "../lib/api";
import { FALLBACK_JOB_RUNS } from "../lib/mock/jobs";

export default async function JobsPage() {
  const response = await fetchJobs();

  return <JobsView items={response?.items ?? FALLBACK_JOB_RUNS} isLive={response !== null} />;
}

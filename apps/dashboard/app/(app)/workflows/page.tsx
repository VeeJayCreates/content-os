import { ProductionQueueScreen } from '@/features/research/components/production-queue-screen';
import { AgentRunView } from '@/features/agent-runtime/components/agent-run-view';

export default function WorkflowsPage() {
  return <>
    <AgentRunView />
    <ProductionQueueScreen />
  </>;
}

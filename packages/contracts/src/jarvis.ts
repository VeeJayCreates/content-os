export type JarvisVoiceState = 'idle' | 'wake_listening' | 'listening' | 'followup_listening' | 'transcribing' | 'thinking' | 'speaking' | 'error' | 'approval_required';
export type JarvisIntent = 'agent_status' | 'blocked_items' | 'failed_items' | 'attention_items' | 'working_agents' | 'waiting_agents' | 'render_status' | 'production_status' | 'research_status' | 'approval_items' | 'greeting' | 'unsupported';

export type JarvisOperationalResponse = {
  intent: JarvisIntent;
  answerText: string;
  spokenAnswerText: string;
  relevantAgentKeys: string[];
  relevantSubject: string | null;
  attentionRequired: boolean;
  contextualData: Array<{ label: string; value: string }>;
  generatedAt: string;
};

export type SpeechTranscription = { text: string; language: string | null; durationMs: number | null; provider: string };

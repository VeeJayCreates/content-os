import { Inject, Injectable } from '@nestjs/common';
import { AgentRunStatus, type AgentRun, type JarvisIntent, type JarvisOperationalResponse } from '@content-os/contracts';
import { AgentRuntimeService } from '../agent-runtime/agent-runtime.service';

const AGENTS = ['research_agent', 'content_agent', 'production_agent', 'publishing_agent', 'engagement_agent', 'analytics_agent'];
const nameFor = (key: string) => key.replace('_agent', ' Agent').replace(/^./, (value) => value.toUpperCase());
type JarvisLanguage = 'english' | 'hindi' | 'hinglish';

@Injectable()
export class JarvisService {
  constructor(private readonly runs: AgentRuntimeService) {}
    private language(value: string): JarvisLanguage {
    if (/[\u0900-\u097F]/.test(value)) {
      return 'hindi';
    }

    const normalized = value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (
      /\b(kya|hai|hain|ka|ki|ke|kar|raha|rahi|karo|batao|kuch|abhi|hua|hui|nahi|nahin|kyun|kitna|kitne|mujhe|ruka|suno|sun|shukriya)\b/.test(
        normalized,
      )
    ) {
      return 'hinglish';
    }

    return 'english';
  }

  async query(text: string): Promise<JarvisOperationalResponse> {
    const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const intent = this.intent(normalized);
    const language = this.language(text);
    const office = await this.runs.office(AGENTS);
    const relevantAgentKeys = this.agentKeys(normalized, intent);
    const source = relevantAgentKeys.length ? office.filter((run) => relevantAgentKeys.includes(run.agentKey)) : office;
    const matching = this.match(source, intent);
    const contextualData = matching.slice(0, 3).map((run) => ({ label: nameFor(run.agentKey), value: run.currentActivity ?? (typeof run.state.blocker === 'string' ? run.state.blocker : this.statusLabel(run.status)) }));
    const attentionRequired = matching.some((run) => run.status === AgentRunStatus.FAILED || Boolean(run.state.blocker) || Boolean(run.state.approvalRequired));
    const answerText = this.answer(intent, matching, relevantAgentKeys, text, language);
    return {
      intent,
      answerText,
      spokenAnswerText: this.spokenAnswer(
        intent,
        matching,
        relevantAgentKeys,
        answerText,
        language,
      ),
      relevantAgentKeys,
      relevantSubject: matching[0]?.subjectId ?? null,
      attentionRequired,
      contextualData,
      generatedAt: new Date().toISOString(),
    };
  }

  private intent(value: string): JarvisIntent {
    if (/^(can you hear me|are you there|hello|hi|hey|good morning|good evening|thank you|thanks|sun rahe ho|sun sakte ho|hello jarvis|hi jarvis|namaste|shukriya|thank you jarvis)$/.test(value)) return 'greeting';
    if (/\bresearch\s+(?:ka\s+)?status\b/.test(value)) return 'research_status';
    if (this.agentKeys(value, 'agent_status').length) return 'agent_status';
    if (/\b(blocked|blocker|kuch blocked hai|ruka hua)\b/.test(value)) return 'blocked_items';
    if (/\b(failed|failure|error|task fail hua)\b/.test(value)) return 'failed_items';
    if (/\b(attention|approval|approve|attention deni)\b/.test(value)) return value.includes('approval') || value.includes('approve') ? 'approval_items' : 'attention_items';
    if (/\b(working|kya kar raha hai|kaam kar raha)\b/.test(value)) return 'working_agents';
    if (/\bwaiting\b/.test(value)) return 'waiting_agents';
    if (/\b(render|rendering)\b/.test(value)) return 'render_status';
    return 'unsupported';
  }
  private agentKeys(value: string, intent: JarvisIntent): string[] {
    const key = AGENTS.find((agent) => value.includes(agent.replace('_agent', '')));
    if (key) return [key];
    return intent === 'research_status' ? ['research_agent'] : intent === 'production_status' || intent === 'render_status' ? ['production_agent'] : [];
  }
  private match(runs: AgentRun[], intent: JarvisIntent) {
    if (intent === 'blocked_items') return runs.filter((run) => Boolean(run.state.blocker));
    if (intent === 'failed_items') return runs.filter((run) => run.status === AgentRunStatus.FAILED);
    if (intent === 'attention_items' || intent === 'approval_items') return runs.filter((run) => Boolean(run.state.approvalRequired) || Boolean(run.state.blocker) || run.status === AgentRunStatus.FAILED);
    if (intent === 'working_agents' || intent === 'render_status') return runs.filter((run) => run.status === AgentRunStatus.RUNNING);
    if (intent === 'waiting_agents') return runs.filter((run) => run.status === AgentRunStatus.WAITING);
    return runs;
  }
  private answer(
    intent: JarvisIntent,
    matches: AgentRun[],
    agents: string[],
    original: string,
    language: JarvisLanguage,
  ) {
    const lower = original.toLowerCase();

    if (intent === 'greeting') {
      if (/can you hear me/.test(lower)) {
        return 'Yes, I can hear you.';
      }

      if (/sun rahe ho|sun sakte ho/.test(lower)) {
        return language === 'hindi'
          ? 'हाँ, मैं आपको सुन सकता हूँ।'
          : 'Haan, main aapko sun sakta hoon.';
      }

      if (/are you there/.test(lower)) {
        return "Yes. I'm here.";
      }

      if (language === 'hindi') {
        return 'नमस्ते। मैं यहाँ हूँ।';
      }

      if (language === 'hinglish') {
        return 'Namaste. Main yahin hoon.';
      }

      return 'Hello.';
    }

    if (intent === 'unsupported') {
      if (language === 'hindi') {
        return 'मैं अभी एजेंट, ब्लॉकर, विफलता, अनुमोदन, रिसर्च, प्रोडक्शन और रेंडरिंग से जुड़े ऑपरेशनल सवालों का जवाब दे सकता हूँ।';
      }

      if (language === 'hinglish') {
        return 'Main abhi agents, blockers, failures, approvals, research, production aur rendering ke operational sawaalon ka jawab de sakta hoon.';
      }

      return 'I can answer read-only operational questions about agents, blockers, failures, approvals, research, production, and rendering.';
    }

    if (!matches.length) {
      if (intent === 'agent_status' && agents[0]) {
        const name = nameFor(agents[0]);

        if (language === 'hindi') {
          return `${name} की अभी कोई रिकॉर्डेड ऑपरेशनल एक्टिविटी नहीं है।`;
        }

        if (language === 'hinglish') {
          return `${name} ki abhi koi recorded operational activity nahi hai.`;
        }

        return `${name} has no recorded operational activity.`;
      }

      if (language === 'hindi') {
        return 'अभी कोई मेल खाती ऑपरेशनल एक्टिविटी रिकॉर्ड नहीं है।';
      }

      if (language === 'hinglish') {
        return 'Abhi koi matching operational activity recorded nahi hai.';
      }

      return 'No matching persisted operational activity is recorded.';
    }

    if (intent === 'agent_status' || agents.length === 1) {
      const run = matches[0]!;
      const name = nameFor(run.agentKey);
      const status = this.statusLabel(run.status);

      if (language === 'hindi') {
        return `${name} अभी ${status} है${run.currentActivity ? `। वर्तमान कार्य: ${run.currentActivity}` : '।'}`;
      }

      if (language === 'hinglish') {
        return `${name} abhi ${status} hai${run.currentActivity ? `. Current activity: ${run.currentActivity}` : '.'}`;
      }

      return `${name} is ${status}${run.currentActivity ? `: ${run.currentActivity}.` : '.'}`;
    }

    if (language === 'hindi') {
      return `${matches.length} ऑपरेशनल आइटम इस स्टेटस से मेल खाते हैं।`;
    }

    if (language === 'hinglish') {
      return `${matches.length} operational item${matches.length === 1 ? '' : 's'} is status se match karte hain.`;
    }

    return `${matches.length} persisted item${matches.length === 1 ? '' : 's'} match this operational status.`;
  }
    private statusLabel(status: AgentRunStatus) { return status.replace('_', ' '); }
    private spokenAnswer(
    intent: JarvisIntent,
    matches: AgentRun[],
    agents: string[],
    fallback: string,
    language: JarvisLanguage,
  ) {
    if (intent === 'agent_status' && agents[0]) {
      const name = nameFor(agents[0]);
      const status = matches[0]
        ? this.statusLabel(matches[0].status)
        : 'idle';

      if (language === 'hindi') {
        return `${name} अभी ${status} है।`;
      }

      if (language === 'hinglish') {
        return `${name} abhi ${status} hai.`;
      }

      return `${name} is ${status}.`;
    }

    if (intent === 'blocked_items') {
      if (language === 'hindi') {
        return matches.length
          ? `${matches.length} ब्लॉक्ड आइटम पर ध्यान देने की जरूरत है।`
          : 'अभी कुछ भी ब्लॉक्ड नहीं है।';
      }

      if (language === 'hinglish') {
        return matches.length
          ? `${matches.length} blocked item${matches.length === 1 ? '' : 's'} ko attention chahiye.`
          : 'Abhi kuch bhi blocked nahi hai.';
      }

      return matches.length
        ? `${matches.length} blocked item${matches.length === 1 ? '' : 's'} need attention.`
        : 'Nothing is currently blocked.';
    }

    if (intent === 'failed_items') {
      if (language === 'hindi') {
        return matches.length
          ? `${matches.length} फेल्ड आइटम पर ध्यान देने की जरूरत है।`
          : 'अभी कोई फेल्योर नहीं है।';
      }

      if (language === 'hinglish') {
        return matches.length
          ? `${matches.length} failed item${matches.length === 1 ? '' : 's'} ko attention chahiye.`
          : 'Abhi koi failure nahi hai.';
      }

      return matches.length
        ? `${matches.length} failed item${matches.length === 1 ? '' : 's'} need attention.`
        : 'No current failures.';
    }

    return fallback.split(/(?<=[.!?।])\s/)[0] ?? fallback;
  }
}

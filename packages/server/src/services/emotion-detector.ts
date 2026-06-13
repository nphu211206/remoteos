/**
 * Emotion Detector — Runtime Emotion Detection
 *
 * Actually detects user emotions from text and adapts responses.
 * This is NOT just prompt instructions — it's real code.
 */

export type Emotion = 'frustrated' | 'excited' | 'confused' | 'stressed' | 'happy' | 'neutral' | 'angry' | 'sad';

export interface EmotionAnalysis {
  emotion: Emotion;
  confidence: number;
  indicators: string[];
  suggestedTone: string;
}

// Emotion detection patterns
const EMOTION_PATTERNS: Record<Emotion, { patterns: RegExp[]; weight: number }> = {
  frustrated: {
    patterns: [
      /không (hoạt động|chạy|làm việc|work)/i,
      /lỗi (liên tục|nhiều|again|lại)/i,
      /tại sao (không|lại|nó)/i,
      /chán|frustrated|annoying|tệ|dở/i,
      /không hiểu|doesn't work|broken/i,
      /sửa (đi|lại|nữa)/i,
      /bao giờ mới|bao nhiêu lần/i,
    ],
    weight: 1.2,
  },
  angry: {
    patterns: [
      /tức|giận|angry|mad|furious/i,
      /quá tệ|rất tệ|thật kinh khủng/i,
      /không thể tin|unbelievable|ridiculous/i,
      /!!!+/,
      /ALL CAPS WORDS/,
    ],
    weight: 1.5,
  },
  excited: {
    patterns: [
      /tuyệt vời|awesome|amazing|great|excellent/i,
      /wow|ôi|ồ|whoa/i,
      /thích|love|yêu|thú vị/i,
      /hay quá|đỉnh|pro|chất/i,
      /🎉|🔥|💪|👍|❤️/i,
    ],
    weight: 1.0,
  },
  confused: {
    patterns: [
      /không hiểu|confused|lost|lạc/i,
      /什么意思|what does|có nghĩa/i,
      /là sao|là gì|how|thế nào/i,
      /help|giúp|help me|i don't get/i,
      /\?{2,}/,
    ],
    weight: 0.8,
  },
  stressed: {
    patterns: [
      /gấp|urgent|nhanh|quick|hurry/i,
      /deadline|trễ|late|overdue/i,
      /áp lực|stress|pressure/i,
      /không kịp|running out of time/i,
      /xin hãy|please help|cứu/i,
    ],
    weight: 1.1,
  },
  happy: {
    patterns: [
      /vui|happy|glad|pleased/i,
      /cảm ơn|thank|thanks/i,
      /tốt|good|nice|perfect/i,
      /hoàn thành|done|xong|finished/i,
      /😊|😄|🙂|☺️/i,
    ],
    weight: 0.9,
  },
  sad: {
    patterns: [
      /buồn|sad|depressed|down/i,
      /thất vọng|disappointed/i,
      /hy vọng|hope|wish/i,
      /ước gì|if only/i,
    ],
    weight: 1.0,
  },
  neutral: {
    patterns: [
      /.*/,
    ],
    weight: 0.1,
  },
};

/**
 * Detect emotion from user text
 */
export function detectEmotion(text: string): EmotionAnalysis {
  const scores: Record<Emotion, number> = {
    frustrated: 0, excited: 0, confused: 0, stressed: 0,
    happy: 0, neutral: 0, angry: 0, sad: 0,
  };

  const indicators: string[] = [];

  // Check each emotion pattern
  for (const [emotion, config] of Object.entries(EMOTION_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(text)) {
        scores[emotion as Emotion] += config.weight;
        indicators.push(`${emotion}: ${pattern.source}`);
      }
    }
  }

  // Check for caps (shouting)
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.7 && text.length > 10) {
    scores.angry += 2;
    indicators.push('angry: high caps ratio');
  }

  // Check for excessive punctuation
  const exclamationCount = (text.match(/!/g) || []).length;
  if (exclamationCount > 3) {
    scores.angry += 1;
    scores.excited += 0.5;
    indicators.push('excessive exclamation marks');
  }

  // Check for question marks (confusion)
  const questionCount = (text.match(/\?/g) || []).length;
  if (questionCount > 2) {
    scores.confused += 1;
    indicators.push('multiple question marks');
  }

  // Find dominant emotion
  let dominantEmotion: Emotion = 'neutral';
  let maxScore = 0;

  for (const [emotion, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      dominantEmotion = emotion as Emotion;
    }
  }

  // Calculate confidence (0-1)
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? maxScore / totalScore : 0;

  // Get suggested tone
  const suggestedTone = getSuggestedTone(dominantEmotion);

  return {
    emotion: dominantEmotion,
    confidence: Math.min(confidence, 1),
    indicators,
    suggestedTone,
  };
}

/**
 * Get suggested response tone based on emotion
 */
function getSuggestedTone(emotion: Emotion): string {
  const tones: Record<Emotion, string> = {
    frustrated: 'Apologize, be extra helpful, offer concrete solutions, acknowledge the issue',
    angry: 'Stay calm, apologize sincerely, focus on fixing the problem immediately',
    excited: 'Match their energy, celebrate with them, be enthusiastic',
    confused: 'Explain clearly, break down into simple steps, use examples',
    stressed: 'Be calm and efficient, prioritize speed, reassure them',
    happy: 'Share their joy, be warm and friendly',
    sad: 'Be empathetic, offer comfort, be gentle',
    neutral: 'Be direct and helpful, normal conversational tone',
  };
  return tones[emotion];
}

/**
 * Inject emotional context into system prompt
 */
export function injectEmotionalContext(basePrompt: string, emotion: EmotionAnalysis): string {
  if (emotion.emotion === 'neutral' && emotion.confidence < 0.3) {
    return basePrompt; // No modification needed
  }

  const emotionContext = `
[EMOTION DETECTION - Runtime]
User appears to be: ${emotion.emotion} (confidence: ${(emotion.confidence * 100).toFixed(0)}%)
Indicators: ${emotion.indicators.slice(0, 3).join(', ')}
Suggested tone: ${emotion.suggestedTone}

Adapt your response accordingly. Don't mention that you detected their emotion — just respond naturally with the appropriate tone.`;

  return basePrompt + emotionContext;
}

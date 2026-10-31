import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import PDFParser from 'pdf2json';

// Helper to extract text from PDF buffer using pdf2json
function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new (PDFParser as any)(null, 1);

    pdfParser.on('pdfParser_dataError', (errData: any) => {
      reject(errData.parserError);
    });

    pdfParser.on('pdfParser_dataReady', () => {
      try {
        const rawText = (pdfParser as any).getRawTextContent();
        resolve(rawText);
      } catch (err) {
        reject(err);
      }
    });

    pdfParser.parseBuffer(buffer);
  });
}

// Fallback rule-based extractor when no LLM API key is configured
function extractQuestionsWithRules(text: string): { questions: any[]; warnings: string[] } {
  const questions: any[] = [];
  const warnings: string[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('----------------Page'));

  let currentQ: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line looks like question start: e.g. "1.", "1-", "س1:", "Question 1:"
    const qMatch = line.match(/^(?:(?:\d+[\.\-\)]\s*)|(?:س\s*\d+[\:\-\.]\s*)|(?:Q(?:uestion)?\s*\d+[\:\.\-]\s*))(.*)/i);
    if (qMatch) {
      if (currentQ && currentQ.questionText && currentQ.optionA && currentQ.optionB) {
        questions.push(currentQ);
      }
      currentQ = {
        questionText: qMatch[1] || line,
        optionA: '',
        optionB: '',
        optionC: null,
        optionD: null,
        correctAnswer: 'A',
        marks: 1,
      };
      continue;
    }

    if (!currentQ) continue;

    // Check options
    const aMatch = line.match(/^(?:[Aأa][\.\-\)]\s*)(.*)/);
    const bMatch = line.match(/^(?:[Bبb][\.\-\)]\s*)(.*)/);
    const cMatch = line.match(/^(?:[Cجc][\.\-\)]\s*)(.*)/);
    const dMatch = line.match(/^(?:[Dدd][\.\-\)]\s*)(.*)/);

    if (aMatch) {
      currentQ.optionA = aMatch[1];
    } else if (bMatch) {
      currentQ.optionB = bMatch[1];
    } else if (cMatch) {
      currentQ.optionC = cMatch[1];
    } else if (dMatch) {
      currentQ.optionD = dMatch[1];
    } else {
      // Append to question text if options not started
      if (!currentQ.optionA) {
        currentQ.questionText += ' ' + line;
      }
    }
  }

  if (currentQ && currentQ.questionText && currentQ.optionA && currentQ.optionB) {
    questions.push(currentQ);
  }

  if (questions.length === 0) {
    warnings.push('لم يتم العثور على نمط أسئلة واضح تلقائياً. يرجى توفير مفتاح LLM API أو استخدام ميزة استيراد JSON.');
  }

  return { questions, warnings };
}

// Call LLM API (Gemini or OpenAI)
async function extractWithLLM(text: string): Promise<{ questions: any[]; warnings: string[] }> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const systemPrompt = `You are a question extraction assistant. Read the exam PDF text and identify all multiple-choice questions.
Return ONLY valid JSON (no markdown, no prose):
{
  "questions": [
    {
      "questionText": "Full question text",
      "optionA": "text",
      "optionB": "text",
      "optionC": "text or null",
      "optionD": "text or null",
      "correctAnswer": "A" | "B" | "C" | "D",
      "marks": 1
    }
  ],
  "warnings": ["optional warnings"]
}`;

  if (geminiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt },
              { text: `Exam Content:\n${text.substring(0, 30000)}` },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        return JSON.parse(content);
      }
    }
  }

  if (openaiKey) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Exam Content:\n${text.substring(0, 30000)}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        return JSON.parse(content);
      }
    }
  }

  // Fallback to pattern matcher if no LLM key or LLM request failed
  return extractQuestionsWithRules(text);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; pdfId: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك' }, { status: 403 });
    }

    const params = await context.params;
    const { id: examId, pdfId } = params;

    // Fetch PDF record
    const { data: record, error: fetchErr } = await supabase
      .from('exam_pdfs')
      .select('*')
      .eq('id', pdfId)
      .eq('exam_id', examId)
      .single();

    if (fetchErr || !record) {
      return NextResponse.json({ ok: false, error: 'ملف PDF غير موجود' }, { status: 404 });
    }

    // Download file from Storage
    const { data: blob, error: downloadErr } = await supabase.storage
      .from('exam-pdfs')
      .download(record.storage_path);

    if (downloadErr || !blob) {
      return NextResponse.json({ ok: false, error: 'فشل تحميل الملف من التخزين' }, { status: 500 });
    }

    const buffer = Buffer.from(await blob.arrayBuffer());

    // Extract text from PDF
    const text = await extractTextFromPdfBuffer(buffer);

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: 'تعذر استخراج نص مقروء من ملف PDF (قد يكون الملف عبارة عن صور ممسوحة ضوئياً)' },
        { status: 400 }
      );
    }

    // Extract questions
    const extractionResult = await extractWithLLM(text);
    const rawQuestions = extractionResult.questions || [];
    const warnings = extractionResult.warnings || [];

    // Validate and prepare questions for insertion
    const { count: existingCount } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('exam_id', examId);

    let startOrder = (existingCount || 0) + 1;
    const validQuestions: any[] = [];

    rawQuestions.forEach((q: any, idx: number) => {
      const qText = q.questionText || q.question || '';
      const optA = q.optionA || q.A || '';
      const optB = q.optionB || q.B || '';
      const optC = q.optionC || q.C || null;
      const optD = q.optionD || q.D || null;
      let corr = String(q.correctAnswer || q.correct || 'A').toUpperCase().trim();

      if (!qText || !optA || !optB) {
        warnings.push(`تم تخطي سؤال رقم ${idx + 1} لعدم اكتمال الخيارات`);
        return;
      }

      if (!['A', 'B', 'C', 'D'].includes(corr)) {
        corr = 'A';
      }

      validQuestions.push({
        exam_id: examId,
        question_text: String(qText).trim(),
        option_a: String(optA).trim(),
        option_b: String(optB).trim(),
        option_c: optC ? String(optC).trim() : null,
        option_d: optD ? String(optD).trim() : null,
        correct_answer: corr,
        marks: q.marks ? Number(q.marks) : 1,
        order: startOrder + validQuestions.length,
      });
    });

    if (validQuestions.length > 0) {
      const { error: insertErr } = await supabase.from('questions').insert(validQuestions);
      if (insertErr) {
        return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      createdCount: validQuestions.length,
      totalFound: rawQuestions.length,
      warnings,
    });
  } catch (error: any) {
    console.error('Extraction error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'حدث خطأ أثناء استخراج الأسئلة' }, { status: 500 });
  }
}

"""Khmer Text Normalization & Chunking Pipeline (KhmerVoice AI).

Handles the core linguistic preprocessing required before passing Khmer text
to TTS models (F5-TTS, VoxCPM 2, Meta MMS):
1. Unicode NFC normalization, zero-width character removal, and confusable repair.
2. Repetition symbol (ៗ / Lek Too) expansion.
3. Date expansion (e.g. ២/១១/២០២៦ or 02-11-2026 -> ថ្ងៃទីពីរ ខែវិច្ឆិកា ឆ្នាំពីរពាន់ម្ភៃប្រាំមួយ).
4. Time expansion (e.g. ០៨:៣០ -> ម៉ោងប្រាំបី សាមសិបនាទី, 7:00 -> ម៉ោងប្រាំពីរគត់).
5. Phone number verbalization (e.g. 012 345 678 -> សូន្យមួយពីរ បីបួនប្រាំ ប្រាំមួយប្រាំពីរប្រាំបី).
6. Currency normalization (៥០០០៛ -> ប្រាំពាន់រៀល, $50 -> ហាសិបដុល្លារ).
7. Numeric ranges, units (km, kg, °C, GB, kHz), decimals, and percentages.
8. Common English tech/loanword phonetic mapping into Khmer script.
9. Clause- and syllable-aware sentence chunking that avoids splitting inside
   Khmer syllable clusters or immediately before unit/classifier words.
"""

from __future__ import annotations

import re
import unicodedata

ZWNJ, ZWJ, ZWSP = "\u200c", "\u200d", "\u200b"

# Repair common Thai-to-Khmer diacritic confusables
_CONFUSABLES = str.maketrans({"็": "៏", "ํ": "ំ"})
# Replace unspoken decorative punctuation with spaces while preserving ។ ៕ ! ? …
_UNSPOKEN = str.maketrans({c: " " for c in "–—‑()[]{}«»<>|/*_~\"'“”‘’"})

_UNITS = [
    "សូន្យ",
    "មួយ",
    "ពីរ",
    "បី",
    "បួន",
    "ប្រាំ",
    "ប្រាំមួយ",
    "ប្រាំពីរ",
    "ប្រាំបី",
    "ប្រាំបួន",
]
_TENS = [
    "",
    "ដប់",
    "ម្ភៃ",
    "សាមសិប",
    "សែសិប",
    "ហាសិប",
    "ហុកសិប",
    "ចិតសិប",
    "ប៉ែតសិប",
    "កៅសិប",
]
_KH_DIGITS = str.maketrans("០១២៣៤៥៦៧៨៩", "0123456789")

_KHMER_MONTHS = {
    1: "មករា",
    2: "កុម្ភៈ",
    3: "មីនា",
    4: "មេសា",
    5: "ឧសភា",
    6: "មិថុនា",
    7: "កក្កដា",
    8: "សីហា",
    9: "កញ្ញា",
    10: "តុលា",
    11: "វិច្ឆិកា",
    12: "ធ្នូ",
}

# Phonetic transliteration for common English words/acronyms in Khmer TTS
DEFAULT_ENGLISH_MAP: dict[str, str] = {
    "AI": "អេអាយ",
    "API": "អេភីអាយ",
    "TTS": "ធីធីអេស",
    "CPU": "ស៊ីភីយូ",
    "GPU": "ជីភីយូ",
    "RAM": "រ៉េម",
    "ROM": "រ៉ូម",
    "SSD": "អេសអេសឌី",
    "USB": "យូអេសប៊ី",
    "PDF": "ភីឌីអេហ្វ",
    "QR": "ឃ្យូអរ",
    "ABA": "អេប៊ីអេ",
    "ATM": "អេធីអឹម",
    "VIP": "វីអាយភី",
    "CEO": "ស៊ីអ៊ីអូ",
    "5G": "ហ្វាយជី",
    "4G": "ហ្វរជី",
    "WiFi": "វ៉ាយហ្វាយ",
    "Wi-Fi": "វ៉ាយហ្វាយ",
    "Bluetooth": "ប៊្លូធូស",
    "Mac": "ម៉ាក់",
    "MacBook": "ម៉ាក់ប៊ុក",
    "Apple": "អេផល",
    "iPhone": "អាយហ្វូន",
    "iPad": "អាយផ্যাត",
    "Android": "អេនដ្រយ",
    "Google": "ហ្គូហ្គល",
    "YouTube": "យូធូប",
    "Facebook": "ហ្វេសប៊ុក",
    "Telegram": "តេឡេក្រាម",
    "TikTok": "តិកតុក",
    "Instagram": "អ៊ីនស្តាក្រាម",
    "Messenger": "មេសសេនជឺ",
    "Comment": "ខមិន",
    "Comments": "ខមិន",
    "Like": "ឡាយក៍",
    "Subscribe": "សាប់ស្ក្រាយ",
    "Share": "ស៊ែរ",
    "Follow": "ហ្វូឡូ",
    "Channel": "ឆានែល",
    "Podcast": "ផតខাস্ট",
    "Vlog": "វ្លុក",
    "Post": "ផុស",
    "Page": "ផេក",
    "Link": "លីង",
    "Story": "ស្តូរី",
    "ChatGPT": "ឆាតជីភីធី",
    "LLM": "អិលអិលអឹម",
    "LoRA": "ឡូរ៉ា",
    "VoxCPM": "វ៉ុកស៊ីភីអឹម",
    "MPS": "អឹមភីអេស",
    "WAV": "វ៉េវ",
    "MP3": "អឹមភីស្រ៊ី",
    "kHz": "គីឡូហឺត",
    "Hz": "ហឺត",
    "GB": "ជីហ្គាបៃ",
    "MB": "មេហ្គាបៃ",
    "TB": "តេរ៉ាបៃ",
    "Computer": "កុំព្យូទ័រ",
    "Software": "សូហ្វវែរ",
    "Hardware": "ហាតវែរ",
    "Internet": "អ៊ីនធឺណិត",
    "Website": "វេបសាយ",
    "Online": "អនឡាញ",
    "Live": "ឡាយ",
    "App": "អេប",
    "Video": "វីដេអូ",
    "Audio": "អូឌីយ៉ូ",
    "Studio": "ស្ទូឌីយោ",
    "Model": "ម៉ូដែល",
    "Server": "សឺវឺ",
    "Cloud": "ខ្លោដ",
    "Data": "ដាតា",
    "System": "ស៊ីស្ទឹម",
    "Code": "កូដ",
    "Python": "ផាយថន",
    "Digital": "ឌីជីថល",
    "Smart": "ស្មាត",
    "Pro": "ប្រូ",
    "Max": "ម៉্যাকស៍",
    "Ultra": "អ៊ុលត្រា",
    "OK": "អូខេ",
    "Hello": "ហេឡូ",
}

_SENT_END = "។៕!?…"
_NEVER_BEFORE = (
    "ខែ",
    "ឆ្នាំ",
    "នាទី",
    "វិនាទី",
    "ម៉ោង",
    "រៀល",
    "ដុល្លារ",
    "នាក់",
    "ភាគរយ",
    "គីឡូ",
    "ម៉ែត្រ",
    "ក្រាម",
    "អង្សា",
)
_GOOD_BEFORE = (
    "នៅ",
    "កាលពី",
    "ដោយ",
    "ដែល",
    "និង",
    "ព្រោះ",
    "ដើម្បី",
    "បន្ទាប់",
    "ក្នុង",
    "ចំពោះ",
    "តាម",
    "រួម",
    "ប៉ុន្តែ",
    "ហើយ",
    "ទោះបី",
    "ប្រសិនបើ",
)
_DEPENDENT = set("ាិីឹឺុូួើឿៀេែៃោៅំះៈ៉៊់៌៍៎៏័៑្")


def normalize_unicode(text: str, keep_zwsp: bool = False) -> str:
    """Normalize Khmer Unicode to NFC, fix confusables, and clean invisible chars."""
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    text = text.translate(_CONFUSABLES).translate(_UNSPOKEN)
    text = text.replace(ZWNJ, "").replace(ZWJ, "")
    if keep_zwsp:
        text = text.replace(ZWSP, " ")
    else:
        text = text.replace(ZWSP, "")
    return " ".join(text.split())


def int_to_khmer(n: int) -> str:
    """Convert an integer into spoken Khmer words."""
    if n < 0:
        return "ដក" + int_to_khmer(-n)
    if n < 10:
        return _UNITS[n]
    if n < 100:
        tens, unit = divmod(n, 10)
        return _TENS[tens] + (_UNITS[unit] if unit else "")
    for value, word in (
        (1_000_000_000, "ពាន់លាន"),
        (1_000_000, "លាន"),
        (100_000, "សែន"),
        (10_000, "ម៉ឺន"),
        (1_000, "ពាន់"),
        (100, "រយ"),
    ):
        if n >= value:
            head, rest = divmod(n, value)
            return int_to_khmer(head) + word + (int_to_khmer(rest) if rest else "")
    return _UNITS[0]


def _digits_to_khmer(digit_str: str) -> str:
    """Read a string of digits one by one in Khmer (used for phone numbers/codes)."""
    clean = digit_str.translate(_KH_DIGITS)
    return "".join(_UNITS[int(ch)] for ch in clean if ch.isdigit())


def _read_number(token: str) -> str:
    token = token.translate(_KH_DIGITS).replace(",", "")
    suffix = ""
    if token.endswith("%"):
        token, suffix = token[:-1], "ភាគរយ"
    if "." in token:
        whole, frac = token.split(".", 1)
        words = (
            int_to_khmer(int(whole or 0))
            + "ក្បៀស"
            + "".join(_UNITS[int(d)] for d in frac if d.isdigit())
        )
    else:
        words = int_to_khmer(int(token)) if token else ""
    return words + suffix


# Numeric DD/MM/YYYY or DD-MM-YYYY date pattern (Khmer or Arabic digits), optionally preceded by ថ្ងៃទី
_DATE_SLASH_RE = re.compile(
    r"(?:ថ្ងៃទី\s*)?(?<![0-9០-៩])([0-9០-៩]{1,2})[/-]([0-9០-៩]{1,2})[/-]([0-9០-៩]{4})(?![0-9០-៩])"
)


def normalize_dates(text: str) -> str:
    """Convert numeric dates like ២/១១/២០២៦ or 02-11-2026 into spoken Khmer dates."""

    def _replace_date(match: re.Match[str]) -> str:
        day_s, month_s, year_s = match.groups()
        day = int(day_s.translate(_KH_DIGITS))
        month = int(month_s.translate(_KH_DIGITS))
        year = int(year_s.translate(_KH_DIGITS))
        if not (1 <= day <= 31 and 1 <= month <= 12):
            return match.group(0)
        month_name = _KHMER_MONTHS[month]
        return f"ថ្ងៃទី{int_to_khmer(day)} ខែ{month_name} ឆ្នាំ{int_to_khmer(year)}"

    return _DATE_SLASH_RE.sub(_replace_date, text)


# Time pattern HH:MM or HH:MM:SS (optionally preceded by ម៉ោង)
_TIME_RE = re.compile(
    r"(?:(ម៉ោង)\s*)?(?<![0-9០-៩])([0-9០-៩]{1,2}):([0-9០-៩]{2})(?::([0-9០-៩]{2}))?(?![0-9០-៩])"
)


def normalize_times(text: str) -> str:
    """Convert clock times like ០៨:៣០ or 14:00 into natural spoken Khmer."""

    def _replace_time(match: re.Match[str]) -> str:
        _, hh_s, mm_s, ss_s = match.groups()
        hh = int(hh_s.translate(_KH_DIGITS))
        mm = int(mm_s.translate(_KH_DIGITS))
        ss = int(ss_s.translate(_KH_DIGITS)) if ss_s is not None else None
        if not (0 <= hh <= 24 and 0 <= mm <= 59):
            return match.group(0)
        if ss is not None and not (0 <= ss <= 59):
            return match.group(0)

        parts = [f"ម៉ោង{int_to_khmer(hh)}"]
        if mm == 0 and (ss is None or ss == 0):
            parts[0] += "គត់"
        elif mm > 0:
            parts.append(f"{int_to_khmer(mm)}នាទី")
        if ss is not None and ss > 0:
            parts.append(f"{int_to_khmer(ss)}វិនាទី")
        return " ".join(parts)

    return _TIME_RE.sub(_replace_time, text)


# Cambodian domestic (0xx xxx xxx[x]) or international (+855 xx xxx xxx[x]) phone numbers
_PHONE_RE = re.compile(
    r"(?:\+855\s*|[0០][1-9១-៩][0-9០-៩])[\s\-]*([0-9០-៩]{3})[\s\-]*([0-9០-៩]{3,4})\b"
)


def normalize_phone_numbers(text: str) -> str:
    """Verbalize phone numbers digit-by-digit in grouped rhythm."""

    def _replace_phone(match: re.Match[str]) -> str:
        full = match.group(0)
        groups = re.split(r"[\s\-]+", full.strip())
        spoken_groups = []
        for g in groups:
            if g.startswith("+"):
                spoken_groups.append("បូក" + _digits_to_khmer(g[1:]))
            else:
                spoken_groups.append(_digits_to_khmer(g))
        return " ".join(s for s in spoken_groups if s)

    return _PHONE_RE.sub(_replace_phone, text)


_USD_PREFIX_RE = re.compile(r"\$\s*([0-9០-៩][0-9០-៩,]*(?:\.[0-9០-៩]+)?)")
_USD_SUFFIX_RE = re.compile(r"([0-9០-៩][0-9០-៩,]*(?:\.[0-9០-៩]+)?)\s*\$")
_RIEL_SUFFIX_RE = re.compile(r"([0-9០-៩][0-9០-៩,]*(?:\.[0-9០-៩]+)?)\s*៛")


def normalize_currencies(text: str) -> str:
    """Verbalize Khmer Riel (៛) and US Dollar ($) amounts."""
    text = _RIEL_SUFFIX_RE.sub(lambda m: f"{_read_number(m.group(1))}រៀល", text)
    text = _USD_PREFIX_RE.sub(lambda m: f"{_read_number(m.group(1))}ដុល្លារ", text)
    text = _USD_SUFFIX_RE.sub(lambda m: f"{_read_number(m.group(1))}ដុល្លារ", text)
    return text.replace("៛", "រៀល").replace("$", "ដុល្លារ")


_RANGE_RE = re.compile(
    r"(?<![0-9០-៩/])([0-9០-៩]+)\s*[-–—]\s*([0-9០-៩]+%?)(?![0-9០-៩/])"
)

_UNIT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"([0-9០-៩]+(?:\.[0-9០-៩]+)?)\s*°\s*C\b", re.IGNORECASE), r"\1 អង្សាសេ"),
    (re.compile(r"([0-9០-៩]+(?:\.[0-9០-៩]+)?)\s*km\b", re.IGNORECASE), r"\1 គីឡូម៉ែត្រ"),
    (re.compile(r"([0-9០-៩]+(?:\.[0-9០-៩]+)?)\s*kg\b", re.IGNORECASE), r"\1 គីឡូក្រាម"),
    (re.compile(r"([0-9០-៩]+(?:\.[0-9០-៩]+)?)\s*cm\b", re.IGNORECASE), r"\1 សង់ទីម៉ែត្រ"),
    (re.compile(r"([0-9០-៩]+(?:\.[0-9០-៩]+)?)\s*mm\b", re.IGNORECASE), r"\1 មីលីម៉ែត្រ"),
]


def normalize_ranges_and_units(text: str) -> str:
    """Expand numeric ranges (10-20 -> ដប់ដល់ម្ភៃ) and measurement units."""
    for pat, repl in _UNIT_PATTERNS:
        text = pat.sub(repl, text)
    text = _RANGE_RE.sub(
        lambda m: f"{_read_number(m.group(1))}ដល់{_read_number(m.group(2))}",
        text,
    )
    return text


_NUM_RE = re.compile(r"[0-9០-៩][0-9០-៩,]*(?:\.[0-9០-៩]+)?%?")


def normalize_numbers(text: str) -> str:
    """Convert remaining Khmer/Arabic numbers and percentages into Khmer words."""
    return _NUM_RE.sub(lambda m: _read_number(m.group(0)), text)


def _split_syllables(chunk: str) -> list[str]:
    """Split a contiguous Khmer string into orthographic syllable clusters."""
    out, cur, i, n = [], "", 0, len(chunk)
    while i < n:
        ch = chunk[i]
        if ch == "្":
            cur += ch
            if i + 1 < n:
                cur += chunk[i + 1]
                i += 2
                continue
            i += 1
            continue
        if ch in _DEPENDENT:
            cur += ch
            i += 1
            continue
        if cur:
            out.append(cur)
        cur = ch
        i += 1
    if cur:
        out.append(cur)
    return out


_REP_RE = re.compile(r"([\u1780-\u17FF]+)\s*ៗ")


def expand_repetition(text: str) -> str:
    """Expand the Khmer repetition symbol ៗ (Lek Too).

    Repeats the preceding short token or final syllable smoothly without
    inserting an artificial breath-pause space inside the reduplicated word.
    """

    def _replace_rep(match: re.Match[str]) -> str:
        word = match.group(1)
        syllables = _split_syllables(word)
        if len(syllables) <= 2:
            return f"{word}{word}"
        # In unspaced phrases like 'ជារៀងរាល់ថ្ងៃៗ', repeat the final syllable/word unit
        tail = "".join(syllables[-1:])
        return f"{word}{tail}"

    return _REP_RE.sub(_replace_rep, text).replace("ៗ", "")


def normalize_english_terms(
    text: str, custom_map: dict[str, str] | None = None
) -> str:
    """Transliterate common English terms/acronyms into Khmer phonetics."""
    mapping = {**DEFAULT_ENGLISH_MAP, **(custom_map or {})}
    # Sort longest first so multi-char matches don't get partially replaced
    for eng, khm in sorted(mapping.items(), key=lambda kv: -len(kv[0])):
        pattern = re.compile(rf"\b{re.escape(eng)}\b", flags=re.IGNORECASE)
        text = pattern.sub(khm, text)
    return " ".join(text.split())


def normalize_khmer_text(
    text: str,
    transliterate_english: bool = True,
    expand_lek_too: bool = True,
    map_khmer_periods: bool = True,
) -> str:
    """Full Khmer text normalization pipeline for TTS."""
    if not text:
        return ""
    text = normalize_dates(text)
    text = normalize_times(text)
    text = normalize_phone_numbers(text)
    text = normalize_currencies(text)
    text = normalize_ranges_and_units(text)
    text = normalize_unicode(text)
    if expand_lek_too:
        text = expand_repetition(text)
    if transliterate_english:
        text = normalize_english_terms(text)
    text = normalize_numbers(text)
    # Convert Khmer sentence enders ។ ៕ into standard pause-inducing periods (. )
    # while strictly preserving emotional punctuation (! ? ... ,)
    if map_khmer_periods:
        text = re.sub(r"\s*[។៕]\s*", r". ", text)
    # Protect ellipses from getting separated
    text = re.sub(r"\.{3,}", "…", text)
    # Ensure clean spacing around sentence punctuation
    text = re.sub(r"\s*([.!?,…])\s*", r"\1 ", text)
    return " ".join(text.split())


def normalize_with_control(
    raw_text: str,
    emotion_prompt: str | None = None,
    transliterate_english: bool = True,
    expand_lek_too: bool = True,
    map_khmer_periods: bool = True,
) -> str:
    """Isolate parenthesized style/emotion control tags before normalizing Khmer text.

    VoxCPM2 steers emotion, prosody, and tempo via parenthesized style prefixes
    (e.g. `(cheerful, energetic tone)សួស្តី`). This helper preserves the English
    or Chinese style tags from being corrupted by Unicode or Khmer token cleaners.
    """
    if not raw_text:
        return ""
    match = re.match(r"^\(([^)]+)\)\s*(.*)$", raw_text.strip(), flags=re.DOTALL)
    if match:
        control_tag, khmer_body = match.group(1).strip(), match.group(2).strip()
    else:
        control_tag, khmer_body = (emotion_prompt.strip() if emotion_prompt else None), raw_text.strip()

    normalized_body = normalize_khmer_text(
        khmer_body,
        transliterate_english=transliterate_english,
        expand_lek_too=expand_lek_too,
        map_khmer_periods=map_khmer_periods,
    )

    if control_tag:
        return f"({control_tag}) {normalized_body}".strip()
    return normalized_body


def _safe_cut(text: str, limit: int) -> int:
    spaces = [i for i, c in enumerate(text[: limit + 1]) if c == " "]
    if spaces:

        def nxt(i: int) -> str:
            return text[i + 1 : i + 12].lstrip()

        allowed = [i for i in spaces if not nxt(i).startswith(_NEVER_BEFORE)]
        if allowed:
            good = [
                i
                for i in allowed
                if i >= limit * 0.35 and nxt(i).startswith(_GOOD_BEFORE)
            ]
            if good:
                return max(good)
            mid_allowed = [i for i in allowed if i >= limit * 0.45]
            return max(mid_allowed) if mid_allowed else max(allowed)
        return max(spaces)
    n = 0
    for syl in _split_syllables(text):
        if n + len(syl) > limit and n:
            return n
        n += len(syl)
    return len(text)


def chunk_khmer_text(
    text: str,
    max_chars: int = 115,
    transliterate_english: bool = True,
    emotion_prompt: str | None = None,
) -> list[str]:
    """Normalize and split Khmer text into breath-sized prosody chunks for smooth TTS inference.

    If parenthesized emotion control instructions are present, every chunk inherits
    the parenthesized style prefix so VoxCPM2 maintains emotional conditioning
    across all chunks.
    """
    if not text:
        return [""]

    # Extract control tag before splitting into sentences
    match = re.match(r"^\(([^)]+)\)\s*(.*)$", text.strip(), flags=re.DOTALL)
    if match:
        control_tag = match.group(1).strip()
        body_to_chunk = match.group(2).strip()
    elif emotion_prompt:
        control_tag = emotion_prompt.strip()
        body_to_chunk = text.strip()
    else:
        control_tag = None
        body_to_chunk = text.strip()

    normalized_text = normalize_khmer_text(
        body_to_chunk, transliterate_english=transliterate_english, map_khmer_periods=True
    )
    raw_sentences = [
        s.strip()
        for s in re.split(r"(?<=[.!?,…])\s+", normalized_text)
        if s.strip()
    ]
    sentences = raw_sentences if raw_sentences else [normalized_text]

    sentence_max = max(80, max_chars)
    raw_chunks, buf = [], ""
    for s in sentences:
        if len(s) > sentence_max:
            if buf:
                raw_chunks.append(buf)
                buf = ""
            while len(s) > sentence_max:
                cut = _safe_cut(s, sentence_max)
                if cut <= 0 or cut >= len(s):
                    break
                raw_chunks.append(s[:cut].strip())
                s = s[cut:].strip()
            if s:
                raw_chunks.append(s)
            continue
        # Only merge very short fragments (< 35 chars); keep full sentences separate
        # so the AR model doesn't pause awkwardly or drift across multiple sentence markers.
        if buf and (len(buf) >= 35 or len(buf) + len(s) + 1 > max_chars):
            raw_chunks.append(buf)
            buf = s
        else:
            buf = f"{buf} {s}".strip()
    if buf:
        raw_chunks.append(buf)

    cleaned_chunks = [c for c in raw_chunks if c] or [""]
    if control_tag:
        return [f"({control_tag}) {c}".strip() for c in cleaned_chunks]
    return cleaned_chunks

/**
 * Context-aware Romanized Hindi (Hinglish) transliteration pipeline.
 *
 * Designed for social video captions:
 *  - Tier 1: Curated, high-precision lexicon of frequent conversational Hindi words
 *    and common English loanwords transcribed into Devanagari by Sarvam.
 *  - Tier 2: Hindi-aware phonological transliterator implementing medial schwa deletion
 *    (syncope), word-final vowel naturalization (a instead of aa, i instead of ee),
 *    and natural consonant conventions (ch instead of chh, d instead of d/r).
 *
 * Guarantees:
 *  - Preserves 1:1 word-level boundaries and timestamps.
 *  - Preserves genuine English words (non-Devanagari) as-is.
 *  - Preserves surrounding punctuation and whitespace.
 *  - Local, deterministic, zero external API dependencies.
 */

// Standalone vowels (word initial or post-vocalic)
const VOWELS: Record<string, string> = {
  "\u0905": "a",   // अ
  "\u0906": "aa",  // आ
  "\u0907": "i",   // इ
  "\u0908": "ee",  // ई
  "\u0909": "u",   // उ
  "\u090A": "oo",  // ऊ
  "\u090B": "ri",  // ऋ
  "\u090F": "e",   // ए
  "\u0910": "ai",  // ऐ
  "\u0913": "o",   // ओ
  "\u0914": "au",  // औ
};

// Vowel signs (matras) that attach to consonants
const MATRAS: Record<string, string> = {
  "\u093E": "aa", // ा (shortened to 'a' at word end in natural Roman Hindi)
  "\u093F": "i",  // ि
  "\u0940": "ee", // ी (shortened to 'i' at word end in natural Roman Hindi)
  "\u0941": "u",  // ु
  "\u0942": "oo", // ू (shortened to 'u' at word end)
  "\u0943": "ri", // ृ
  "\u0947": "e",  // े
  "\u0948": "ai", // ै
  "\u094B": "o",  // ो
  "\u094C": "au", // ौ
};

// Consonants → Roman
const CONSONANTS: Record<string, string> = {
  "\u0915": "k",   // क
  "\u0916": "kh",  // ख
  "\u0917": "g",   // ग
  "\u0918": "gh",  // घ
  "\u0919": "ng",  // ङ
  "\u091A": "ch",  // च
  "\u091B": "ch",  // छ (natural Romanization: 'ch' as in kuch, pucha, accha)
  "\u091C": "j",   // ज
  "\u091D": "jh",  // झ
  "\u091E": "n",   // ञ
  "\u091F": "t",   // ट
  "\u0920": "th",  // ठ
  "\u0921": "d",   // ड
  "\u0922": "dh",  // ढ
  "\u0923": "n",   // ण
  "\u0924": "t",   // त
  "\u0925": "th",  // थ
  "\u0926": "d",   // द
  "\u0927": "dh",  // ध
  "\u0928": "n",   // न
  "\u092A": "p",   // प
  "\u092B": "ph",  // फ
  "\u092C": "b",   // ब
  "\u092D": "bh",  // भ
  "\u092E": "m",   // म
  "\u092F": "y",   // य
  "\u0930": "r",   // र
  "\u0932": "l",   // ल
  "\u0935": "v",   // व
  "\u0936": "sh",  // श
  "\u0937": "sh",  // ष
  "\u0938": "s",   // स
  "\u0939": "h",   // ह
  // Nukta variants (Urdu / loan consonants)
  "\u0958": "q",   // क़
  "\u0959": "kh",  // ख़
  "\u095A": "g",   // ग़
  "\u095B": "z",   // ज़
  "\u095C": "d",   // ड़ (natural Romanization: bada, ladka, ped, ghadi)
  "\u095D": "dh",  // ढ़ (natural Romanization: padhna, seedhi)
  "\u095E": "f",   // फ़
};

const DIGITS: Record<string, string> = {
  "\u0966": "0", "\u0967": "1", "\u0968": "2", "\u0969": "3", "\u096A": "4",
  "\u096B": "5", "\u096C": "6", "\u096D": "7", "\u096E": "8", "\u096F": "9",
};

const VIRAMA       = "\u094D"; // ् (halant — suppresses inherent vowel)
const NUKTA        = "\u093C"; // ़
const ANUSVARA     = "\u0902"; // ं
const CHANDRABINDU = "\u0901"; // ँ
const VISARGA      = "\u0903"; // ः

/**
 * Tier 1: Curated Lexicon for High-Frequency Conversational Hindi & English Loanwords.
 * Provides exact, natural spellings expected in social-video captions.
 */
const LEXICON: Record<string, string> = {
  // Pronouns, Ergatives & Obliques
  "मैं": "main",
  "मैंने": "maine",
  "मुझे": "mujhe",
  "मुझको": "mujhko",
  "मुझसे": "mujhse",
  "मेरा": "mera",
  "मेरे": "mere",
  "मेरी": "meri",
  "हम": "hum",
  "हमने": "humne",
  "हमें": "humein",
  "हमको": "humko",
  "हमसे": "humse",
  "हमारा": "humara",
  "हमारे": "humare",
  "हमारी": "humari",
  "तू": "tu",
  "तूने": "tune",
  "तुझे": "tujhe",
  "तुझको": "tujhko",
  "तेरा": "tera",
  "तेरे": "tere",
  "तेरी": "teri",
  "तुम": "tum",
  "तुमने": "tumne",
  "तुम्हें": "tumhein",
  "तुमको": "tumko",
  "तुमसे": "tumse",
  "तुम्हारा": "tumhara",
  "तुम्हारे": "tumhare",
  "तुम्हारी": "tumhari",
  "आप": "aap",
  "आपने": "aapne",
  "आपको": "aapko",
  "आपसे": "aapse",
  "आपका": "aapka",
  "आपके": "aapke",
  "आपकी": "aapki",
  "यह": "yeh",
  "ये": "ye",
  "वह": "woh",
  "वो": "wo",
  "इस": "is",
  "इसने": "isne",
  "इसे": "ise",
  "इसको": "isko",
  "इससे": "isse",
  "इसका": "iska",
  "इसके": "iske",
  "इसकी": "iski",
  "इसमें": "ismein",
  "उस": "us",
  "उसने": "usne",
  "उसे": "use",
  "उसको": "usko",
  "उससे": "usse",
  "उसका": "uska",
  "उसके": "uske",
  "उसकी": "uski",
  "उसमें": "usmein",
  "इन": "in",
  "इन्होंने": "inhone",
  "इन्हें": "inhein",
  "इनको": "inko",
  "इनसे": "inse",
  "इनका": "inka",
  "इनके": "inke",
  "इनकी": "inki",
  "उन": "un",
  "उन्होंने": "unhone",
  "उन्हें": "unhein",
  "उनको": "unko",
  "उनसे": "unse",
  "उनका": "unka",
  "उनके": "unke",
  "उनकी": "unki",
  "कौन": "kaun",
  "किसने": "kisne",
  "किसे": "kise",
  "किसको": "kisko",
  "किससे": "kisse",
  "किसका": "kiska",
  "किसके": "kiske",
  "किसकी": "kiski",
  "किसमें": "kismein",
  "जो": "jo",
  "जिसने": "jisne",
  "जिसे": "jise",
  "जिसको": "jisko",
  "जिससे": "jisse",
  "जिसका": "jiska",
  "जिसके": "jiske",
  "जिसकी": "jiski",
  "जिसमें": "jismein",
  "जिन्होंने": "jinhone",
  "जिन्हें": "jinhein",
  "जिनका": "jinka",
  "जिनके": "jinke",
  "जिनकी": "jinki",
  "खुद": "khud",
  "अपना": "apna",
  "अपने": "apne",
  "अपनी": "apni",
  "आपस": "aapas",

  // Conjunctions, Particles & Adverbs
  "और": "aur",
  "या": "ya",
  "तो": "to",
  "भी": "bhi",
  "ही": "hi",
  "कि": "ki",
  "की": "ki",
  "के": "ke",
  "का": "ka",
  "को": "ko",
  "से": "se",
  "में": "mein",
  "पे": "pe",
  "पर": "par",
  "तक": "tak",
  "नहीं": "nahi",
  "ना": "na",
  "मत": "mat",
  "कुछ": "kuch",
  "कोई": "koi",
  "कभी": "kabhi",
  "सभी": "sabhi",
  "अभी": "abhi",
  "तभी": "tabhi",
  "यहाँ": "yahan",
  "यहां": "yahan",
  "वहाँ": "wahan",
  "वहां": "wahan",
  "कहाँ": "kahan",
  "कहां": "kahan",
  "जहाँ": "jahan",
  "जहां": "jahan",
  "इधर": "idhar",
  "उधर": "udhar",
  "किधर": "kidhar",
  "जिधर": "jidhar",
  "बहुत": "bahut",
  "ज़्यादा": "zyada",
  "ज्यादा": "zyada",
  "कम": "kam",
  "थोड़ा": "thoda",
  "थोड़ी": "thodi",
  "थोड़े": "thode",
  "काफ़ी": "kafi",
  "काफी": "kafi",
  "बस": "bas",
  "सिर्फ": "sirf",
  "सिर्फ़": "sirf",
  "लेकिन": "lekin",
  "मगर": "magar",
  "परंतु": "parantu",
  "क्योंकि": "kyunki",
  "इसलिए": "isliye",
  "अगर": "agar",
  "यदि": "yadi",
  "जब": "jab",
  "तब": "tab",
  "कब": "kab",
  "अब": "ab",
  "सब": "sab",
  "सबका": "sabka",
  "सबके": "sabke",
  "सबकी": "sabki",
  "कैसे": "kaise",
  "कैसा": "kaisa",
  "कैसी": "kaisi",
  "जैसे": "jaise",
  "जैसा": "jaisa",
  "जैसी": "jaisi",
  "वैसे": "waise",
  "वैसा": "waisa",
  "वैसी": "waisi",
  "ऐसे": "aise",
  "ऐसा": "aisa",
  "ऐसी": "aisi",
  "कितना": "kitna",
  "कितने": "kitne",
  "कितनी": "kitni",
  "जितना": "jitna",
  "जितने": "jitne",
  "जितनी": "jitni",
  "इतना": "itna",
  "इतने": "itne",
  "इतनी": "itni",
  "उतना": "utna",
  "उतने": "utne",
  "उतनी": "utni",
  "पहले": "pehle",
  "पहला": "pehla",
  "पहली": "pehli",
  "बाद": "baad",
  "दूसरा": "dusra",
  "दूसरे": "dusre",
  "दूसरी": "dusri",
  "तीसरा": "teesra",
  "तीसरे": "teesre",
  "तीसरी": "teesri",
  "आगे": "aage",
  "पीछे": "peeche",
  "ऊपर": "upar",
  "नीचे": "neeche",
  "अंदर": "andar",
  "बाहर": "bahar",
  "पास": "paas",
  "दूर": "door",
  "साथ": "saath",
  "सामने": "saamne",
  "बीच": "beech",
  "तरफ": "taraf",
  "वजह": "wajah",
  "बारे": "baare",
  "बिना": "bina",
  "ज़रूर": "zaroor",
  "जरूर": "zaroor",
  "ज़रूरी": "zaroori",
  "जरूरी": "zaroori",
  "शायद": "shayad",
  "सच": "sach",
  "सचमुच": "sachmuch",
  "झूठ": "jhooth",
  "हमेशा": "hamesha",
  "रोज़": "roz",
  "रोज": "roz",
  "आज": "aaj",
  "कल": "kal",
  "परसों": "parson",
  "सुबह": "subah",
  "शाम": "shaam",
  "रात": "raat",
  "दिन": "din",
  "साल": "saal",
  "महीने": "mahine",
  "महीना": "mahina",
  "हफ्ते": "hafte",
  "हफ्ता": "hafta",
  "बार": "baar",
  "दोबारा": "dobaara",
  "क्यों": "kyun",
  "क्यो": "kyon",

  // Common Verbs & Auxiliaries
  "है": "hai",
  "हैं": "hain",
  "हो": "ho",
  "हूँ": "hoon",
  "हूं": "hoon",
  "था": "tha",
  "थे": "the",
  "थी": "thi",
  "थीं": "theen",
  "होगा": "hoga",
  "होगी": "hogi",
  "होंगे": "honge",
  "होना": "hona",
  "होने": "hone",
  "होता": "hota",
  "होती": "hoti",
  "होते": "hote",
  "होकर": "hokar",
  "हुआ": "hua",
  "हुई": "hui",
  "हुए": "hue",
  "कहा": "kaha",
  "कहे": "kahe",
  "कही": "kahi",
  "कहना": "kehna",
  "कहने": "kehne",
  "कहता": "kehta",
  "कहती": "kehti",
  "कहते": "kehte",
  "कहो": "kaho",
  "कहिए": "kahiye",
  "रहा": "raha",
  "रही": "rahi",
  "रहे": "rahe",
  "रहना": "rehna",
  "रहने": "rehne",
  "रहता": "rehta",
  "रहती": "rehti",
  "रहते": "rehte",
  "रहो": "raho",
  "गया": "gaya",
  "गई": "gayi",
  "गए": "gaye",
  "जाना": "jaana",
  "जाने": "jaane",
  "जाता": "jaata",
  "जाती": "jaati",
  "जाते": "jaate",
  "जाओ": "jao",
  "जाइए": "jaiye",
  "किया": "kiya",
  "किए": "kiye",
  "करना": "karna",
  "करने": "karne",
  "करता": "karta",
  "करती": "karti",
  "करते": "karte",
  "करो": "karo",
  "करिए": "kariye",
  "करके": "karke",
  "दिया": "diya",
  "दिए": "diye",
  "दी": "di",
  "देना": "dena",
  "देने": "dene",
  "देता": "deta",
  "देती": "deti",
  "देते": "dete",
  "दो": "do",
  "दीजिए": "dijiye",
  "देकर": "dekar",
  "लिया": "liya",
  "लिए": "liye",
  "ली": "li",
  "लेना": "lena",
  "लेने": "lene",
  "लेता": "leta",
  "लेती": "leti",
  "लेते": "lete",
  "लो": "lo",
  "लीजिए": "lijiye",
  "लेकर": "lekar",
  "सकता": "sakta",
  "सकती": "sakti",
  "सकते": "sakte",
  "सका": "saka",
  "सकी": "saki",
  "सके": "sake",
  "सकें": "sakein",
  "चाहिए": "chahiye",
  "चाहता": "chahta",
  "चाहती": "chahti",
  "चाहते": "chahte",
  "आया": "aaya",
  "आई": "aayi",
  "आए": "aaye",
  "आना": "aana",
  "आने": "aane",
  "आता": "aata",
  "आती": "aati",
  "आते": "aate",
  "आओ": "aao",
  "आइए": "aaiye",
  "देखा": "dekha",
  "देखी": "dekhi",
  "देखे": "dekhe",
  "देखना": "dekhna",
  "देखने": "dekhne",
  "देखता": "dekhta",
  "देखती": "dekhti",
  "देखते": "dekhte",
  "देखो": "dekho",
  "देखिए": "dekhiye",
  "बोला": "bola",
  "बोली": "boli",
  "बोले": "bole",
  "बोलना": "bolna",
  "बोलने": "bolne",
  "बोलता": "bolta",
  "बोलती": "bolti",
  "बोलते": "bolte",
  "बोलो": "bolo",
  "सुना": "suna",
  "सुनी": "suni",
  "सुने": "sune",
  "सुनना": "sunna",
  "सुनने": "sunne",
  "सुनता": "sunta",
  "सुनती": "sunti",
  "सुनते": "sunte",
  "सुनो": "suno",
  "सोचा": "socha",
  "सोची": "sochi",
  "सोचे": "soche",
  "सोचना": "sochna",
  "सोचने": "sochne",
  "सोचता": "sochta",
  "सोचती": "sochti",
  "सोचते": "sochte",
  "सोचो": "socho",
  "समझा": "samjha",
  "समझी": "samjhi",
  "समझे": "samjhe",
  "समझना": "samjhna",
  "समझने": "samjhne",
  "समझता": "samjhta",
  "समझती": "samjhti",
  "समझते": "samjhte",
  "पूछा": "pucha",
  "पूछी": "puchi",
  "पूछे": "puche",
  "पूछना": "puchna",
  "पूछने": "puchne",
  "पूछता": "puchta",
  "पूछती": "puchti",
  "पूछते": "puchte",
  "पूछो": "pucho",
  "बनाया": "banaya",
  "बनाई": "banayi",
  "बनाए": "banaye",
  "बनाना": "banana",
  "बनाने": "banane",
  "बनाता": "banata",
  "बनाती": "banati",
  "बनाते": "banate",
  "लगता": "lagta",
  "लगती": "lagti",
  "लगते": "lagte",
  "लगा": "laga",
  "लगी": "lagi",
  "लगे": "lage",
  "मिला": "mila",
  "मिली": "mili",
  "मिले": "mile",
  "मिलना": "milna",
  "मिलने": "milne",
  "मिलता": "milta",
  "मिलती": "milti",
  "मिलते": "milte",

  // Common Nouns & Adjectives
  "बात": "baat",
  "बातें": "baatein",
  "काम": "kaam",
  "नाम": "naam",
  "चीज़": "cheez",
  "चीज": "cheez",
  "चीज़ें": "cheezein",
  "चीजें": "cheezein",
  "लोग": "log",
  "लोगों": "logon",
  "दोस्त": "dost",
  "दोस्तों": "doston",
  "घर": "ghar",
  "पैसा": "paisa",
  "पैसे": "paise",
  "अच्छा": "accha",
  "अच्छी": "acchi",
  "अच्छे": "acche",
  "बुरा": "bura",
  "बुरी": "buri",
  "बुरे": "bure",
  "बड़ा": "bada",
  "बड़ी": "badi",
  "बड़े": "bade",
  "छोटा": "chhota",
  "छोटी": "chhoti",
  "छोटे": "chhote",
  "सही": "sahi",
  "गलत": "galat",
  "नया": "naya",
  "नई": "nayi",
  "नए": "naye",
  "पुराना": "purana",
  "पुरानी": "purani",
  "पुराने": "purane",
  "खुश": "khush",
  "सवाल": "sawal",
  "जवाब": "jawab",
  "तरीका": "tareeka",
  "तरीके": "tareeke",
  "रास्ता": "raasta",
  "समय": "samay",
  "वक्त": "waqt",
  "जिंदगी": "zindagi",
  "ज़िंदगी": "zindagi",
  "दुनिया": "duniya",
  "देश": "desh",
  "बातचीत": "baatchit",
  "नमस्ते": "namaste",
  "शुक्रिया": "shukriya",
  "धन्यवाद": "dhanyawad",
  "भाई": "bhai",
  "बहन": "behen",
  "माँ": "maa",
  "मां": "maa",
  "बाप": "baap",
  "पिता": "pita",
  "माता": "mata",
  "लड़का": "ladka",
  "लड़की": "ladki",
  "लड़के": "ladke",
  "लड़कियां": "ladkiyan",
  "बच्चा": "baccha",
  "बच्चे": "bacche",
  "बच्चों": "bacchon",

  // Sarvam Devanagari English Loanwords -> Genuine English
  "वीडियो": "video",
  "विडियो": "video",
  "चैनल": "channel",
  "सब्सक्राइब": "subscribe",
  "सब्सक्राइबर": "subscriber",
  "सब्सक्राइबर्स": "subscribers",
  "लाइक": "like",
  "लाइक्स": "likes",
  "शेयर": "share",
  "कमेंट": "comment",
  "कमेंट्स": "comments",
  "फॉलो": "follow",
  "फॉलोअर्स": "followers",
  "फॉलोवर": "follower",
  "व्यूज": "views",
  "व्यूज़": "views",
  "व्यू": "view",
  "कंटेंट": "content",
  "क्रिएटर": "creator",
  "क्रिएटर्स": "creators",
  "टाइम": "time",
  "लाइफ": "life",
  "प्रॉब्लम": "problem",
  "प्रॉब्लम्स": "problems",
  "मनी": "money",
  "फ्रेंड": "friend",
  "फ्रेंड्स": "friends",
  "फैमिली": "family",
  "ऑफिस": "office",
  "बिजनेस": "business",
  "कंपनी": "company",
  "स्टार्टअप": "startup",
  "स्मार्टफोन": "smartphone",
  "फोन": "phone",
  "मोबाइल": "mobile",
  "कंप्यूटर": "computer",
  "लैपटॉप": "laptop",
  "इंटरनेट": "internet",
  "ऑनलाइन": "online",
  "ऑफलाइन": "offline",
  "सॉफ्टवेयर": "software",
  "हार्डवेयर": "hardware",
  "ऐप": "app",
  "एप": "app",
  "एप्लीकेशन": "application",
  "वेबसाइट": "website",
  "लिंक": "link",
  "पोस्ट": "post",
  "मैसेज": "message",
  "कॉल": "call",
  "स्क्रीन": "screen",
  "ऑडियो": "audio",
  "कैप्शन": "caption",
  "कैप्शनंस": "captions",
  "एडिट": "edit",
  "एडिटर": "editor",
  "एडिटिंग": "editing",
  "रिकॉर्ड": "record",
  "रिकॉर्डिंग": "recording",
  "अपलोड": "upload",
  "डाउनलोड": "download",
  "क्लिक": "click",
  "बटन": "button",
  "क्वालिटी": "quality",
  "कैमरा": "camera",
  "माइक": "mic",
  "स्टूडियो": "studio",
  "प्लेटफॉर्म": "platform",
  "सोशल": "social",
  "मीडिया": "media",
  "अकाउंट": "account",
  "प्रोफाइल": "profile",
  "पासवर्ड": "password",
  "यूजर": "user",
  "नेटवर्क": "network",
  "मार्केट": "market",
  "मार्केटिंग": "marketing",
  "डिजिटल": "digital",
  "टीम": "team",
  "मीटिंग": "meeting",
  "प्रोजेक्ट": "project",
  "प्लान": "plan",
  "आइडिया": "idea",
  "गोल": "goal",
  "टारगेट": "target",
  "रिजल्ट": "result",
  "सक्सेस": "success",
  "स्टोरी": "story",
  "रिएक्शन": "reaction",
  "रिव्यू": "review",
  "एक्सपीरियंस": "experience",
  "सिस्टम": "system",
  "डेटा": "data",
  "फाइल": "file",
  "फोल्डर": "folder",
  "चेक": "check",
  "टेस्ट": "test",
  "ट्रेंड": "trend",
  "ट्रेंडिंग": "trending",
  "वायरल": "viral",
  "सुपर": "super",
  "कूल": "cool",
  "बेस्ट": "best",
  "टॉप": "top",
  "नंबर": "number",
  "लेवल": "level",
  "स्टेप": "step",
  "पॉइंट": "point",
  "स्पेशल": "special",
  "सिंपल": "simple",
  "इजी": "easy",
  "हार्ड": "hard",
  "फास्ट": "fast",
  "स्लो": "slow",
  "रियल": "real",
  "ओके": "ok",
  "प्लीज": "please",
  "थैंक्स": "thanks",
  "थैंक": "thank",
  "सॉरी": "sorry",
  "बाय": "bye",
  "हाय": "hi",
  "हेलो": "hello",
  "यस": "yes",
  "नो": "no",

  // Conversational Code-Switching & Technical Vocabulary
  "डोंट": "don't",
  "गेट": "get",
  "मी": "me",
  "रॉन्ग": "wrong",
  "सोसाइटी": "society",
  "प्रोटेस्ट": "protest",
  "इंपॉर्टेंट": "important",
  "इम्पॉर्टेंट": "important",
  "इंपोर्टेंट": "important",
  "इम्पोर्टेंट": "important",
  "साइंटिस्ट": "scientist",
  "साइंटिस्ट्स": "scientists",
  "साइंटिस्टों": "scientists",
  "टेक्नोलॉजी": "technology",
  "टेक्नोलॉजिस": "technologies",
  "एंटरप्रेन्योर": "entrepreneur",
  "एंटरप्रेन्योर्स": "entrepreneurs",
  "सिस्टमैटिक": "systematic",
  "सिस्टेमेटिक": "systematic",
  "डेफिशियेंसी": "deficiency",
  "डेफिशियेंसीज": "deficiencies",
  "डेफिशिएंसी": "deficiency",
  "डेफिशिएंसीज": "deficiencies",
  "ऑलरेडी": "already",
  "स्ट्रांगली": "strongly",
  "बिलीव": "believe",
  "इनोवेट": "innovate",
  "इनोवेशन": "innovation",
  "स्टूडेंट": "student",
  "स्टूडेंट्स": "students",
  "मीडियम": "medium",
  "एग्जाम": "exam",
  "एग्जाम्स": "exams",
  "लॉ": "law",
  "एक्सेसिबिलिटी": "accessibility",
  "एक्सेसिबल": "accessible",
  "ग्लैमरस": "glamorous",
  "क्यूट": "cute",
  "एजुकेशन": "education",
  "कंटिन्यू": "continue",
  "इम्प्रूव": "improve",
  "इम्प्रूवमेंट": "improvement",
  "डेवलपमेंट": "development",
  "कस्टमर": "customer",
  "कस्टमर्स": "customers",
  "सर्विस": "service",
  "प्रोडक्ट": "product",
  "प्रोडक्ट्स": "products",
  "फीचर": "feature",
  "फीचर्स": "features",
  "अपडेट": "update",
  "अपडेट्स": "updates",
  "वर्जन": "version",
  "अल्गोरिदम": "algorithm",
  "एल्गोरिदम": "algorithm",
  "कंसिस्टेंट": "consistent",
  "कंसिस्टेंसी": "consistency",
};

export function hasDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

/**
 * Tier 2: Hindi-aware phonological transliteration of a single Devanagari root word.
 * Applies medial schwa deletion (syncope), natural word-final vowels, and consonant conventions.
 */
function algorithmicTransliterateWord(word: string): string {
  const chars = Array.from(word.normalize("NFC"));
  const len = chars.length;
  let out = "";

  const isConsonant = (c?: string): c is string =>
    !!c && (c in CONSONANTS || (c.length === 1 && c >= "\u0915" && c <= "\u0939"));
  const isMatra = (c?: string): c is string =>
    !!c && (c in MATRAS || (c >= "\u093E" && c <= "\u094C"));
  const isVirama = (c?: string): c is string => c === VIRAMA;
  const isAnusvara = (c?: string): c is string => c === ANUSVARA || c === CHANDRABINDU;

  let consonantCount = 0;

  for (let i = 0; i < len; i++) {
    let ch = chars[i]!;
    const next = chars[i + 1];

    // Combine decomposed nukta if present
    if (next === NUKTA && (ch + NUKTA) in CONSONANTS) {
      ch = ch + NUKTA;
      i++;
    }

    if (isConsonant(ch)) {
      consonantCount++;
      const rom = CONSONANTS[ch] ?? "k";
      out += rom;

      const following = chars[i + 1];

      // Halant (virama) suppresses inherent vowel
      if (isVirama(following)) {
        i++;
        continue;
      }

      // Explicit matra follows
      if (isMatra(following)) {
        i++;
        const matraChar: string = following;
        const afterMatra = chars[i + 1];
        const isWordFinal =
          afterMatra === undefined ||
          isAnusvara(afterMatra) ||
          !/[\u0900-\u097F]/.test(afterMatra);

        // Word-final vowel shortening for natural Roman Hindi:
        // - word-final 'ा' -> 'a' (kaha, raha, gaya, diya, kiya, tha), internal -> 'aa' (baat, naam)
        // - word-final 'ी' -> 'i' (nahi, bhi, ki, hi, karti, rahi), internal -> 'ee'
        // - word-final 'ू' -> 'u', internal -> 'oo'
        if (matraChar === "\u093E") {
          out += isWordFinal ? "a" : "aa";
        } else if (matraChar === "\u0940") {
          out += isWordFinal ? "i" : "ee";
        } else if (matraChar === "\u0942") {
          out += isWordFinal ? "u" : "oo";
        } else if (matraChar === "\u0947" && isAnusvara(afterMatra)) {
          // Nasalized e in Hinglish is commonly written 'ein' (mein, karein, dekhein)
          out += "ein";
          i++; // consume anusvara
        } else {
          out += MATRAS[matraChar] ?? "";
        }
        continue;
      }

      // Word boundary follows: drop trailing inherent 'a' in modern Hindi
      const isWordEnd = following === undefined || !/[\u0900-\u097F]/.test(following);
      if (isWordEnd) {
        continue;
      }

      // Medial consonant followed by another Devanagari character:
      // Schwa Deletion (syncope) condition:
      // In Standard Hindi phonology (V C ə C V -> V C C V), an inherent schwa /a/ is deleted if:
      // 1. It is not the word-initial consonant (consonantCount > 1).
      // 2. The subsequent consonant has a matra and is the word's final consonant (e.g. kit-ni, kar-na, sak-ta, cha-mak-ta).
      // 3. Or it is the 2nd consonant of a 4-consonant compound without matras (bach-pan).
      let shouldDeleteSchwa = false;

      if (consonantCount > 1) {
        let nextConsonantIdx = -1;
        for (let j = i + 1; j < len; j++) {
          if (isConsonant(chars[j])) {
            nextConsonantIdx = j;
            break;
          }
        }

        if (nextConsonantIdx !== -1) {
          const afterNextConsonant = chars[nextConsonantIdx + 1];
          const nextHasMatra = isMatra(afterNextConsonant);

          let hasMoreConsonants = false;
          for (let j = nextConsonantIdx + 1; j < len; j++) {
            if (isConsonant(chars[j])) {
              hasMoreConsonants = true;
              break;
            }
          }

          const wordHasAnyMatra = chars.some(isMatra);

          if (nextHasMatra && !hasMoreConsonants) {
            // Pre-suffix schwa deletion: kit-ni, kar-na, sak-ta, cha-mak-ta, sa-maj-na
            shouldDeleteSchwa = true;
          } else if (!wordHasAnyMatra && consonantCount === 2) {
            // Compound 4-consonant word without matras: bach-pan, ak-bar
            let subsequentConsonants = 0;
            for (let j = nextConsonantIdx; j < len; j++) {
              if (isConsonant(chars[j])) subsequentConsonants++;
            }
            if (subsequentConsonants >= 2) {
              shouldDeleteSchwa = true;
            }
          }
        }
      }

      if (!shouldDeleteSchwa) {
        out += "a";
      }
      continue;
    }

    // Standalone vowels
    if (VOWELS[ch]) {
      const isWordFinal =
        chars[i + 1] === undefined || !/[\u0900-\u097F]/.test(chars[i + 1]!);
      if (ch === "\u0906" && isWordFinal) {
        out += "a";
      } else if (ch === "\u0908" && isWordFinal) {
        out += "i";
      } else if (ch === "\u090A" && isWordFinal) {
        out += "u";
      } else {
        out += VOWELS[ch];
      }
      continue;
    }

    // Matra without preceding consonant (rare / malformed)
    if (MATRAS[ch]) {
      out += MATRAS[ch];
      continue;
    }

    // Anusvara & Chandrabindu
    if (isAnusvara(ch)) {
      const nextChar = chars[i + 1];
      // Do not duplicate nasal if previous sound is already 'n'/'m' or next is 'न'/'म'
      // Prevents 'mainne' -> 'maine'
      if (out.endsWith("n") || out.endsWith("m")) {
        continue;
      }
      if (nextChar && (nextChar === "\u0928" || nextChar === "\u092E")) {
        continue;
      }
      out += "n";
      continue;
    }

    if (ch === VISARGA) {
      out += "h";
      continue;
    }

    if (DIGITS[ch]) {
      out += DIGITS[ch];
      continue;
    }

    if (ch === VIRAMA || ch === NUKTA) continue;
    if (ch === "\u0964" || ch === "\u0965") {
      out += ".";
      continue;
    }

    // Pass through non-Devanagari characters
    out += ch;
  }

  return out
    .replace(/aaa+/g, "aa")
    .replace(/eee+/g, "ee")
    .replace(/iii+/g, "ii")
    .replace(/ooo+/g, "oo")
    .replace(/uuu+/g, "uu")
    .trim();
}

/**
 * Transliterates Devanagari text to natural Roman (Latin) script.
 * Preserves genuine English words, word boundaries, and punctuation.
 */
export function transliterateToRoman(input: string): string {
  if (!input || !hasDevanagari(input)) return input;

  // Split into tokens preserving all whitespace delimiters
  const tokens = input.split(/(\s+)/);

  return tokens
    .map((token) => {
      if (!token || /^\s+$/.test(token)) return token;
      if (!hasDevanagari(token)) return token;

      // Extract leading and trailing punctuation/symbols around the core word
      const match = token.match(
        /^([^\u0900-\u097F\w]*)([\u0900-\u097F\w\u200C\u200D]+)([^\u0900-\u097F\w]*)$/,
      );

      if (!match) {
        return algorithmicTransliterateWord(token);
      }

      const [, leading = "", core = "", trailing = ""] = match;

      if (!hasDevanagari(core)) {
        return token;
      }

      const normalizedCore = core.normalize("NFC");

      // Tier 1: Lexicon lookup
      if (LEXICON[normalizedCore]) {
        return leading + LEXICON[normalizedCore] + trailing;
      }

      // Check hyphenated compounds (e.g. बातचीत or बात-चीत)
      if (normalizedCore.includes("-")) {
        const parts = normalizedCore.split("-");
        const converted = parts.map((p) =>
          LEXICON[p] ? LEXICON[p] : algorithmicTransliterateWord(p),
        );
        return leading + converted.join("-") + trailing;
      }

      // Tier 2: Algorithmic phonological transliteration
      const romanCore = algorithmicTransliterateWord(normalizedCore);
      return leading + romanCore + trailing;
    })
    .join("");
}
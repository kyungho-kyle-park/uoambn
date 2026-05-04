import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';

// ─── State ────────────────────────────────────────────────────
const Q_VERSION = '2026-05-04-v3';
if (localStorage.getItem('qVersion') !== Q_VERSION) {
  localStorage.removeItem('questionStatus');
  localStorage.setItem('qVersion', Q_VERSION);
}

const state = {
  webR:                null,
  webrReady:           false,
  questions:           [],
  currentQuestion:     null,
  currentCourse:       'R',
  editor:              null,
  questionStatus:      new Map(Object.entries(JSON.parse(localStorage.getItem('questionStatus') || '{}'))),
  collapsedSets:       new Set(JSON.parse(localStorage.getItem('collapsedSets') || '[]')),
  questionEditorState: {},
  savedSetEnvs:        new Set(),
};

const CLIENT_ID = (() => {
  let id = localStorage.getItem('client_id');
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('client_id', id); }
  return id;
})();

const $ = id => document.getElementById(id);

// ─── Init ─────────────────────────────────────────────────────
async function init() {
  const authed = sessionStorage.getItem('auth') === '1';
  if (authed) {
    showApp();
    startWebR();
  } else {
    $('pwd-modal').classList.remove('hidden');
  }

  $('pwd-form').addEventListener('submit', onPasswordSubmit);
  $('run-btn').addEventListener('click', runCode);
  $('clear-btn').addEventListener('click', () => { state.editor?.setValue(''); state.editor?.focus(); });
  $('clear-console-btn').addEventListener('click', clearConsole);
  $('show-solution-btn').addEventListener('click', toggleSolution);
  $('copy-solution-btn').addEventListener('click', copySolution);
  $('hamburger').addEventListener('click', toggleSidebar);
  $('sidebar-overlay').addEventListener('click', closeSidebar);

  await loadQuestions();
}

// ─── Password ─────────────────────────────────────────────────
async function onPasswordSubmit(e) {
  e.preventDefault();
  const input = $('pwd-input').value.trim();
  if (!input) return;
  if (await checkPassword(input)) {
    sessionStorage.setItem('auth', '1');
    $('pwd-modal').classList.add('hidden');
    showApp();
    startWebR();
  } else {
    $('pwd-error').textContent = 'Incorrect password — please try again.';
    $('pwd-input').value = '';
    $('pwd-input').focus();
  }
}

async function checkPassword(input) {
  try {
    const resp = await fetch('./data/password.json');
    const { hash } = await resp.json();
    const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    const hex  = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    return hex === hash;
  } catch { return false; }
}

// ─── App Display ──────────────────────────────────────────────
function showApp() {
  $('app').classList.remove('hidden');
  initEditor();
}

// ─── WebR ─────────────────────────────────────────────────────
async function startWebR() {
  const screen = $('loading-screen');
  screen.classList.remove('hidden');
  setStatus('loading', 'Loading R...');

  // Init WebR engine once
  if (!state.webR) {
    try {
      state.webR = new WebR();
      await state.webR.init();
    } catch (err) {
      showRetryButton(`Failed to load R engine: ${err.message}`);
      return;
    }
  }

  // Install + load packages with up to 3 retries
  const MAX_TRIES = 3;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      $('load-status').textContent =
        attempt === 1
          ? 'Installing packages — first load takes 30–90s…'
          : `Retrying install (${attempt}/${MAX_TRIES})…`;

      await state.webR.evalRVoid("webr::install('dplyr')");
      await state.webR.evalRVoid("webr::install('ggplot2')");
      await state.webR.evalRVoid("webr::install('DescTools')");
      await state.webR.evalRVoid("library(dplyr); library(ggplot2); library(DescTools)");

      // Pre-build Week 3 Set 1 (KiwiConnect) environment so 'customers' is always available
      try {
        $('load-status').textContent = 'Preparing datasets…';
        await state.webR.evalRVoid(`
customers <- data.frame(
  customer_id   = c(1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016,1017,1018,1019,1020,1021,1022,1023,1024,1025,1026,1027,1028,1029,1030,1031,1032,1033,1034,1035,1036,1037,1038,1039,1040,1041,1042,1043,1044,1045,1046,1047,1048,1049,1050,1051,1052,1053,1054,1055,1056,1057,1058,1059,1060,1061,1062,1063,1064,1065,1066,1067,1068,1069,1070,1071,1072,1073,1074,1075,1076,1077,1078,1079,1080,1081,1082,1083,1084,1085,1086,1087,1088,1089,1090,1091,1092,1093,1094,1095,1096,1097,1098,1099,1100,1101,1102,1103,1104,1105,1106,1107,1108,1109,1110,1111,1112,1113,1114,1115,1116,1117,1118,1119,1120,1121,1122,1123,1124,1125,1126,1127,1128,1129,1130,1131,1132,1133,1134,1135,1136,1137,1138,1139,1140,1141,1142,1143,1144,1145,1146,1147,1148,1149,1150),
  age           = c(58,25,19,65,35,33,32,0,65,24,61,65,75,52,23,55,45,20,19,23,31,32,50,56,19,53,30,63,59,62,52,44,32,999,55,35,69,73,18,66,69,28,62,45,39,35,27,31,79,66,39,24,23,42,24,40,72,40,56,34,69,20,64,47,52,25,77,42,23,53,36,71,58,57,74,73,41,54,30,63,22,150,60,32,67,36,23,72,32,73,24,42,35,47,58,71,41,28,41,40,31,60,35,62,77,61,59,22,56,58,28,52,64,33,28,47,42,35,77,58,62,53,32,61,38,71,67,67,21,32,70,20,69,38,43,35,22,31,76,78,54,74,63,38,31,59,49,43,74,76),
  age_group     = c("55-64","25-34","<25","65+","35-44","25-34","25-34","<25","65+","<25","55-64","65+","65+","45-54","<25","55-64","45-54","<25","<25","<25","25-34","25-34","45-54","55-64","<25","45-54","25-34","55-64","55-64","55-64","45-54","35-44","25-34","65+","55-64","35-44","65+","65+","<25","65+","65+","25-34","55-64","45-54","35-44","35-44","25-34","25-34","65+","65+","35-44","<25","<25","35-44","<25","35-44","65+","35-44","55-64","25-34","65+","<25","55-64","45-54","45-54","25-34","65+","35-44","<25","45-54","35-44","65+","55-64","55-64","65+","65+","35-44","45-54","25-34","55-64","<25","65+","55-64","25-34","65+","35-44","<25","65+","25-34","65+","<25","35-44","35-44","45-54","55-64","65+","35-44","25-34","35-44","35-44","25-34","55-64","35-44","55-64","65+","55-64","55-64","<25","55-64","55-64","25-34","45-54","55-64","25-34","25-34","45-54","35-44","35-44","65+","55-64","55-64","45-54","25-34","55-64","35-44","65+","65+","65+","<25","25-34","65+","<25","65+","35-44","35-44","35-44","<25","25-34","65+","65+","45-54","65+","55-64","35-44","25-34","55-64","45-54","35-44","65+","65+"),
  monthly_spend = c(121,114,280,318,57,117,73,210,39,717,233,253,155,45,182,198,105,71,81,253,95,163,38,93,131,114,314,77,158,86,135,208,388,151,110,31,157,73,287,250,219,82,178,257,325,525,486,79,84,99,229,215,438,134,153,231,119,134,131,50,309,134,276,278,209,132,66,129,570,109,153,59,129,82,113,89,252,101,149,185,316,164,140,143,141,121,170,158,105,279,131,293,58,117,265,87,153,292,119,172,110,93,54,280,338,199,130,125,128,51,201,190,108,138,195,273,175,125,226,49,303,245,134,145,343,259,156,273,45,171,199,121,270,150,381,93,121,367,131,52,103,82,173,219,370,211,241,180,284,183),
  broadband     = c(1,1,0,1,1,0,0,1,1,1,1,1,0,0,1,1,1,1,1,1,1,0,1,1,1,1,0,1,1,0,1,1,0,1,0,0,1,1,1,1,1,1,1,1,1,1,0,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1,1,0,1,0,1,0,1,1,1,0,1,1,0,0,1,1,1,0,1,1,1,0,1,1,1,1,1,1,1,1,1,0,0,1,0,1,0,1,1,1,1,1,0,0,1,1,0,1,0,1,1,1,1,0,1,1,1,0,1,1,1,1,1,1,0,1,1,1,1,0,1,1,1,1,1,0,1,0,0,1,1,1,1,1,1,0,1,1),
  mobile        = c(1,1,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,0,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,1,0,1,0,0),
  tv            = c(0,1,1,0,0,0,1,0,0,0,1,1,1,1,0,0,1,1,1,1,0,1,0,1,1,0,1,0,1,1,1,1,0,0,1,0,1,0,0,0,0,0,1,0,0,0,0,1,1,1,1,0,1,1,0,0,1,0,0,1,1,1,0,0,0,0,0,0,0,1,1,1,0,0,0,0,1,0,0,1,0,0,0,0,0,1,0,1,0,1,1,0,0,0,0,1,0,1,1,1,0,1,0,1,1,1,1,1,0,0,0,1,0,0,0,0,1,1,1,0,0,0,0,0,1,0,1,0,0,0,1,1,0,1,1,0,0,1,0,1,1,1,0,1,0,1,0,1,0,1),
  landline      = c(0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,1,0,0,0,0,0,0,0,1,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1,0,0,1,1,0,1,0,0,0,0,1,0,1,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,1,0,0,0,0,1,0,1,0,0,1,0,1,0,0,0,0,0,0,0,1,0,0,1,1,0,1,0,0,1,1,0,0,1,0,0,0,1,0,1,1,1,0,0,1,0,0,0,1,0,1,1,0,0,1),
  stringsAsFactors = FALSE
)
save(customers, file = '/tmp/env_w3s1.RData')
rm(customers)
        `);
        state.savedSetEnvs.add('w3s1');
      } catch (_) { /* non-fatal */ }

      // Pre-build Week 3 Set 2 (HomeFinder NZ)
      try {
        await state.webR.evalRVoid(`
listings <- data.frame(
  listing_id = c(2001,2002,2003,2004,2005,2006,2007,2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026,2027,2028,2029,2030,2031,2032,2033,2034,2035,2036,2037,2038,2039,2040,2041,2042,2043,2044,2045,2046,2047,2048,2049,2050,2051,2052,2053,2054,2055,2056,2057,2058,2059,2060,2061,2062,2063,2064,2065,2066,2067,2068,2069,2070,2071,2072,2073,2074,2075,2076,2077,2078,2079,2080,2081,2082,2083,2084,2085,2086,2087,2088,2089,2090,2091,2092,2093,2094,2095,2096,2097,2098,2099,2100,2101,2102,2103,2104,2105,2106,2107,2108,2109,2110,2111,2112,2113,2114,2115,2116,2117,2118,2119,2120,2121,2122,2123,2124,2125,2126,2127,2128,2129,2130,2131,2132,2133,2134,2135,2136,2137,2138,2139,2140,2141,2142,2143,2144,2145,2146,2147,2148,2149,2150),
  region = c("Hamilton","Auckland","Christchurch","Tauranga","Auckland","Hamilton","Wellington","Tauranga","Auckland","Hamilton","Wellington","Christchurch","Christchurch","Wellington","Auckland","Auckland","Wellington","Auckland","Wellington","Auckland","Wellington","Auckland","Auckland","Auckland","Christchurch","Wellington","Hamilton","Auckland","Auckland","Auckland","Wellington","Auckland","Auckland","Auckland","Auckland","Auckland","Auckland","Christchurch","Christchurch","Auckland","Wellington","Wellington","Auckland","Christchurch","Tauranga","Auckland","Auckland","Auckland","Auckland","Christchurch","Christchurch","Wellington","Auckland","Hamilton","Auckland","Christchurch","Wellington","Wellington","Wellington","Christchurch","Auckland","Hamilton","Auckland","Hamilton","Auckland","Auckland","Auckland","Tauranga","Auckland","Auckland","Auckland","Wellington","Tauranga","Christchurch","Auckland","Christchurch","Auckland","Christchurch","Wellington","Wellington","Hamilton","Christchurch","Auckland","Tauranga","Christchurch","Auckland","Auckland","Christchurch","Wellington","Auckland","Auckland","Hamilton","Auckland","Tauranga","Tauranga","Tauranga","Wellington","Auckland","Wellington","Auckland","Tauranga","Auckland","Wellington","Auckland","Auckland","Wellington","Hamilton","Auckland","Christchurch","Auckland","Wellington","Auckland","Auckland","Wellington","Auckland","Hamilton","Christchurch","Auckland","Wellington","Wellington","Auckland","Christchurch","Christchurch","Auckland","Auckland","Auckland","Hamilton","Hamilton","Auckland","Wellington","Tauranga","Christchurch","Auckland","Auckland","Hamilton","Wellington","Auckland","Auckland","Wellington","Wellington","Wellington","Wellington","Wellington","Wellington","Auckland","Auckland","Hamilton","Auckland","Auckland","Auckland"),
  property_type = c("House","Townhouse","Section","Apartment","House","Apartment","House","House","Apartment","House","House","Townhouse","Apartment","Apartment","House","House","Apartment","Townhouse","Apartment","Townhouse","House","Townhouse","House","House","Apartment","Townhouse","House","Apartment","Apartment","Townhouse","House","House","House","House","House","House","Townhouse","Townhouse","House","Apartment","Apartment","Townhouse","Section","House","House","House","Section","House","House","Townhouse","Townhouse","House","Apartment","Townhouse","House","Section","Townhouse","Apartment","House","Section","Apartment","Apartment","House","House","Townhouse","Townhouse","Section","House","Townhouse","Section","Section","House","Apartment","Townhouse","Townhouse","House","Apartment","Section","Apartment","House","Townhouse","House","House","Section","Apartment","House","Apartment","Apartment","House","House","House","Apartment","House","Townhouse","Apartment","House","Townhouse","Townhouse","Apartment","House","House","Apartment","House","Apartment","Townhouse","House","Apartment","Section","Townhouse","Townhouse","Apartment","Apartment","Apartment","House","Section","Section","House","Section","Townhouse","House","Townhouse","Apartment","Apartment","Apartment","House","House","House","Apartment","House","House","Section","House","Townhouse","Townhouse","House","Townhouse","Townhouse","House","House","Apartment","Apartment","Apartment","House","Apartment","Apartment","House","Townhouse","House","Apartment","Apartment"),
  bedrooms = c(3,4,3,3,3,3,2,3,3,4,2,4,0,2,2,3,3,2,2,2,3,3,2,3,2,2,3,4,3,3,2,3,2,2,4,2,3,3,4,2,2,3,4,4,4,2,3,4,0,2,3,3,4,2,2,3,99,4,3,2,2,4,2,5,4,2,3,3,4,3,2,3,3,2,3,3,3,3,2,2,2,2,3,3,4,3,3,3,2,4,3,3,4,3,3,3,3,3,3,2,3,3,3,3,3,3,4,4,2,3,3,3,2,3,2,2,2,2,3,5,3,4,2,4,3,4,3,4,5,3,3,3,2,3,4,3,2,3,4,3,4,2,2,2,3,2,2,2,3,2),
  price_nzd = c(803000,714000,350000,507000,910000,552000,766000,554000,562000,869000,678000,640000,444000,540000,993000,1121000,467000,558000,633000,645000,1009000,711000,1141000,1164000,535000,504000,805000,594000,445000,812000,794000,1144000,1187000,763000,1074000,1190000,563000,439000,653000,498000,442000,622000,395000,894000,622000,989000,335000,946000,708000,678000,399000,615000,716000,608000,586000,224000,759000,673000,815000,290000,779000,509000,852000,736000,784000,807000,494000,919000,547000,412000,441000,1007000,582000,417000,712000,718000,759000,307000,617000,818000,420000,889000,582000,383000,594000,1190000,594000,423000,759000,666000,694000,467000,1165000,636000,366000,846000,598000,502000,659000,676000,693000,514000,788000,701000,838000,850000,487000,450000,403000,562000,644000,581000,554000,953000,455000,225000,637000,488000,426000,589000,762000,423000,598000,540000,1174000,771000,598000,478000,968000,874000,253000,849000,798000,494000,654000,759000,805000,997000,820000,665000,535000,408000,881000,392000,677000,1009000,556000,1124000,659000,679000),
  days_on_market = c(4,4,17,6,58,15,20,34,29,6,57,20,9,49,21,14,58,37,26,15,15,41,42,21,2,26,35,6,22,2,21,30,33,32,30,97,20,47,18,50,27,19,6,9,13,20,53,22,58,13,35,23,31,28,25,44,62,3,10,3,7,6,2,5,7,2,45,7,12,12,18,25,1,40,29,11,14,16,40,9,15,38,9,23,38,2,57,5,27,25,43,24,19,16,47,24,11,15,2,3,25,1,13,8,23,20,33,27,20,7,50,86,43,29,16,3,41,31,42,13,2,38,21,55,13,14,23,24,3,31,4,20,25,5,4,1,9,4,24,112,21,11,30,21,1,9,34,45,24,26),
  stringsAsFactors = FALSE
)
save(listings, file = '/tmp/env_w3s2.RData')
rm(listings)
        `);
        state.savedSetEnvs.add('w3s2');
      } catch (_) { /* non-fatal */ }

      // Pre-build Week 3 Set 3 (WellFit NZ)
      try {
        await state.webR.evalRVoid(`
members <- data.frame(
  member_id = c(3001,3002,3003,3004,3005,3006,3007,3008,3009,3010,3011,3012,3013,3014,3015,3016,3017,3018,3019,3020,3021,3022,3023,3024,3025,3026,3027,3028,3029,3030,3031,3032,3033,3034,3035,3036,3037,3038,3039,3040,3041,3042,3043,3044,3045,3046,3047,3048,3049,3050,3051,3052,3053,3054,3055,3056,3057,3058,3059,3060,3061,3062,3063,3064,3065,3066,3067,3068,3069,3070,3071,3072,3073,3074,3075,3076,3077,3078,3079,3080,3081,3082,3083,3084,3085,3086,3087,3088,3089,3090,3091,3092,3093,3094,3095,3096,3097,3098,3099,3100,3101,3102,3103,3104,3105,3106,3107,3108,3109,3110,3111,3112,3113,3114,3115,3116,3117,3118,3119,3120,3121,3122,3123,3124,3125,3126,3127,3128,3129,3130,3131,3132,3133,3134,3135,3136,3137,3138,3139,3140,3141,3142,3143,3144,3145,3146,3147,3148,3149,3150),
  gender = c("Female","Male","Female","Non-binary","Male","Female","Female","Non-binary","Male","Female","Male","Female","Female","Male","Male","Male","Female","Male","Female","Male","Male","Male","Male","Male","Female","Male","Female","Male","Male","Male","Female","Male","Male","Male","Male","Male","Male","Female","Female","Male","Female","Male","Male","Female","Non-binary","Male","Male","Male","Male","Female","Female","Male","Male","Female","Male","Female","Female","Male","Male","Female","Male","Female","Male","Female","Male","Male","Male","Non-binary","Male","Male","Male","Male","Non-binary","Female","Male","Female","Male","Female","Male","Female","Female","Female","Male","Non-binary","Female","Male","Male","Female","Female","Male","Male","Female","Male","Female","Female","Non-binary","Male","Male","Female","Male","Non-binary","Male","Male","Male","Male","Female","Female","Male","Female","Male","Female","Male","Male","Female","Male","Female","Female","Male","Female","Male","Male","Female","Female","Male","Male","Male","Female","Female","Male","Female","Non-binary","Female","Male","Male","Female","Female","Male","Male","Male","Female","Male","Male","Male","Male","Male","Male","Female","Male","Male","Male"),
  age = c(70,63,41,36,32,60,45,55,55,61,18,36,38,29,66,67,34,42,0,23,65,69,62,20,46,46,62,29,47,45,23,38,69,24,68,19,70,56,42,34,43,47,49,67,68,47,22,47,33,23,51,38,50,54,64,23,47,54,52,33,69,51,44,57,21,23,62,66,49,32,56,70,34,22,62,47,18,35,55,61,37,56,60,22,44,26,22,19,150,55,55,27,33,58,60,54,63,50,43,46,50,69,57,31,59,36,62,51,29,26,55,36,39,32,55,55,60,30,28,68,20,25,32,45,64,41,43,25,51,40,63,23,43,67,32,67,58,52,37,42,22,44,41,18,33,55,42,69,31,64),
  age_group = c("55+","55+","35-44","35-44","25-34","55+","45-54","55+","55+","55+","18-24","35-44","35-44","25-34","55+","55+","25-34","35-44","18-24","18-24","55+","55+","55+","18-24","45-54","45-54","55+","25-34","45-54","45-54","18-24","35-44","55+","18-24","55+","18-24","55+","55+","35-44","25-34","35-44","45-54","45-54","55+","55+","45-54","18-24","45-54","25-34","18-24","45-54","35-44","45-54","45-54","55+","18-24","45-54","45-54","45-54","25-34","55+","45-54","35-44","55+","18-24","18-24","55+","55+","45-54","25-34","55+","55+","25-34","18-24","55+","45-54","18-24","35-44","55+","55+","35-44","55+","55+","18-24","35-44","25-34","18-24","18-24","55+","55+","55+","25-34","25-34","55+","55+","45-54","55+","45-54","35-44","45-54","45-54","55+","55+","25-34","55+","35-44","55+","45-54","25-34","25-34","55+","35-44","35-44","25-34","55+","55+","55+","25-34","25-34","55+","18-24","25-34","25-34","45-54","55+","35-44","35-44","25-34","45-54","35-44","55+","18-24","35-44","55+","25-34","55+","55+","45-54","35-44","35-44","18-24","35-44","35-44","18-24","25-34","55+","35-44","55+","25-34","55+"),
  bmi = c(25.3,20.5,24.8,33.6,31.4,32.4,34.1,28.0,19.5,24.5,34.8,31.1,28.6,30.2,32.2,20.6,21.9,21.1,29.4,30.0,18.6,21.4,33.3,30.7,22.1,34.1,29.4,30.7,21.5,21.0,34.6,28.4,24.9,3.2,24.1,34.6,33.4,30.0,19.5,30.8,30.3,23.6,33.0,28.1,34.2,32.5,19.9,26.4,24.7,20.0,21.4,23.2,23.4,28.8,28.6,18.9,30.6,29.0,23.6,25.4,32.7,29.7,19.0,22.2,23.8,34.0,19.9,28.2,25.2,21.3,24.2,34.0,34.8,30.2,29.6,24.8,30.9,23.5,30.4,25.2,22.3,33.8,28.1,22.1,20.4,19.7,20.3,32.5,25.7,20.0,34.1,210.0,18.7,22.3,32.0,19.9,30.1,22.6,22.5,18.9,28.3,32.7,25.7,25.3,28.2,28.4,18.9,32.5,26.1,19.1,19.9,20.3,26.8,31.1,32.1,20.8,34.5,31.8,19.7,32.5,24.2,29.1,32.1,29.3,31.9,30.9,26.2,25.5,19.6,28.2,28.6,22.9,30.3,20.0,29.3,28.7,30.1,22.6,30.2,21.6,19.3,29.2,28.9,19.7,27.3,23.6,26.2,27.1,30.1,32.5),
  exercise_days = c(3,5,2,3,2,3,5,3,3,1,7,2,3,3,2,2,0,5,6,0,3,5,0,7,4,3,3,5,4,5,5,7,6,4,3,6,3,5,4,7,6,5,5,2,7,4,7,4,6,3,7,2,3,2,3,6,4,4,4,3,4,3,4,4,6,4,4,3,5,2,4,5,7,2,4,4,4,5,6,5,7,6,4,3,6,3,5,6,4,4,4,4,7,7,5,1,7,4,3,5,3,6,5,3,3,4,7,3,3,4,3,3,4,4,4,4,2,2,2,1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,2,2,2,2),
  membership = c("Standard","Premium","Standard","Basic","Premium","Standard","Basic","Standard","Basic","Basic","Standard","Standard","Standard","Standard","Premium","Basic","Premium","Standard","Basic","Standard","Standard","Basic","Premium","Basic","Premium","Basic","Basic","Standard","Standard","Premium","Standard","Standard","Standard","Standard","Standard","Basic","Standard","Standard","Basic","Standard","Standard","Basic","Premium","Standard","Basic","Basic","Basic","Basic","Standard","Standard","Standard","Basic","Basic","Standard","Standard","Standard","Standard","Basic","Premium","Basic","Basic","Basic","Standard","Standard","Standard","Standard","Basic","Basic","Standard","Standard","Standard","Basic","Standard","Basic","Standard","Standard","Standard","Standard","Standard","Standard","Premium","Standard","Basic","Premium","Basic","Basic","Standard","Basic","Premium","Basic","Standard","Basic","Basic","Premium","Standard","Basic","Standard","Basic","Standard","Standard","Basic","Basic","Basic","Standard","Premium","Standard","Standard","Standard","Basic","Basic","Basic","Standard","Basic","Standard","Standard","Basic","Basic","Premium","Basic","Premium","Premium","Standard","Basic","Basic","Basic","Standard","Standard","Standard","Standard","Basic","Basic","Standard","Basic","Standard","Standard","Basic","Standard","Basic","Basic","Standard","Standard","Basic","Premium","Standard","Basic","Premium","Basic","Basic","Premium","Basic"),
  stringsAsFactors = FALSE
)
save(members, file = '/tmp/env_w3s3.RData')
rm(members)
        `);
        state.savedSetEnvs.add('w3s3');
      } catch (_) { /* non-fatal */ }

      state.webrReady = true;
      screen.classList.add('hidden');
      setStatus('ready', 'R Ready');
      $('run-btn').disabled = false;
      return;
    } catch (err) {
      if (attempt === MAX_TRIES) {
        showRetryButton(`Install failed after ${MAX_TRIES} attempts. Check your connection.`);
      }
    }
  }
}

function showRetryButton(message) {
  $('load-status').textContent = message;
  setStatus('error', 'R Error');

  const existing = document.getElementById('retry-btn');
  if (existing) return;

  const btn = document.createElement('button');
  btn.id = 'retry-btn';
  btn.textContent = '↺ Retry';
  btn.className = 'btn-primary';
  btn.style.cssText = 'margin-top:12px; font-size:0.85rem; padding:8px 20px;';
  btn.onclick = () => { btn.remove(); startWebR(); };
  $('load-status').insertAdjacentElement('afterend', btn);
}

function setStatus(type, text) {
  const dot  = $('webrStatus').querySelector('.status-dot');
  const span = $('webrStatus').querySelector('.status-text');
  dot.className  = `status-dot ${type}`;
  span.textContent = text;
}

// ─── Editor ───────────────────────────────────────────────────
function initEditor() {
  if (state.editor) return;
  state.editor = CodeMirror($('editor-container'), {
    mode: 'r', theme: 'eclipse',
    lineNumbers: true,
    indentUnit: 2, tabSize: 2, indentWithTabs: false,
    lineWrapping: true,
    matchBrackets: true,
    value: '# Write your R code here\n',
    extraKeys: {
      'Ctrl-Enter':   runCode,
      'Cmd-Enter':    runCode,
      'Alt--':        cm => cm.replaceSelection(' <- '),
      'Ctrl-Shift-M': cm => cm.replaceSelection(' %>% '),
    },
  });
  state.editor.setSize('100%', 300);
  setTimeout(() => state.editor.refresh(), 0);
}

// ─── Questions ────────────────────────────────────────────────
async function loadQuestions() {
  try {
    const resp = await fetch('./data/questions.json');
    state.questions = await resp.json();
    renderSidebar();
  } catch (err) {
    console.error('Failed to load questions:', err);
  }
}

function renderSidebar() {
  const el   = $('sidebar-content');
  const list = state.questions;
  const weeks = [...new Set(list.map(q => q.week))].sort((a, b) => a - b);

  el.innerHTML = weeks.map(w => {
    const weekQs    = list.filter(q => q.week === w);
    const weekDone  = weekQs.filter(q => state.questionStatus.get(String(q.id)) === 'done').length;
    const sets      = [...new Set(weekQs.map(q => q.set))].sort((a, b) => a - b);
    const weekLocked = weekQs.every(q => isLocked(q));

    if (weekLocked) {
      return `
        <div class="sidebar-week">
          <div class="week-header">
            <span class="week-header-label">Week ${w}</span>
            <span class="week-header-line"></span>
          </div>
          <div class="week-locked-msg">🔒 Unlocks after class</div>
        </div>`;
    }

    return `
      <div class="sidebar-week">
        <div class="week-header">
          <span class="week-header-label">Week ${w}</span>
          <span class="week-header-line"></span>
          <span class="week-header-count">${weekDone}/${weekQs.length}</span>
        </div>
        ${sets.map(s => {
          const setQs    = weekQs.filter(q => q.set === s);
          const setTitle = setQs[0]?.set_title || `Set ${s}`;
          const setDone  = setQs.filter(q => state.questionStatus.get(String(q.id)) === 'done').length;
          const setKey   = `w${w}s${s}`;
          const collapsed = state.collapsedSets.has(setKey);

          return `
            <div class="sidebar-set">
              <div class="set-header ${collapsed ? 'collapsed' : ''}" data-set-key="${setKey}">
                <svg class="set-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                <span class="set-title-text">Set ${s} · ${setTitle}</span>
                <span class="set-count">${setDone}/${setQs.length}</span>
              </div>
              <ul class="q-list ${collapsed ? 'hidden' : ''}">
                ${setQs.map(q => {
                  const locked  = isLocked(q);
                  const active  = state.currentQuestion?.id === q.id;
                  const status  = state.questionStatus.get(String(q.id));
                  const qNum    = q.id > 100 ? `E${q.id - 100}` : String(q.id);
                  let statusHtml = '';
                  if (locked) statusHtml = '<span class="q-status locked">🔒</span>';
                  return `
                    <li class="q-item ${active ? 'active' : ''} ${locked ? 'locked-item' : ''} ${status === 'done' && !active ? 'done' : ''}"
                        data-id="${q.id}" tabindex="${locked ? -1 : 0}" role="button">
                      <span class="q-num-badge">${qNum}</span>
                      <span class="q-item-title">${q.title}</span>
                      ${statusHtml}
                    </li>`;
                }).join('')}
              </ul>
            </div>`;
        }).join('')}
      </div>`;
  }).join('');

  el.querySelectorAll('.set-header').forEach(h =>
    h.addEventListener('click', () => toggleSet(h.dataset.setKey))
  );
  el.querySelectorAll('.q-item:not(.locked-item)').forEach(item => {
    const select = () => selectQuestion(parseInt(item.dataset.id));
    item.addEventListener('click', select);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') select(); });
  });
}

function isLocked(q) { return new Date() < new Date(q.release_at); }

function toggleSet(setKey) {
  if (state.collapsedSets.has(setKey)) state.collapsedSets.delete(setKey);
  else state.collapsedSets.add(setKey);
  localStorage.setItem('collapsedSets', JSON.stringify([...state.collapsedSets]));
  renderSidebar();
}

async function selectQuestion(id) {
  const q = state.questions.find(x => x.id === id);
  if (!q) return;

  // Save current question's editor + output before switching
  if (state.currentQuestion) {
    saveEditorState(state.currentQuestion.id);
    // Mark as skipped if they never ran code on this question
    if (!state.questionStatus.has(String(state.currentQuestion.id))) {
      state.questionStatus.set(String(state.currentQuestion.id), 'skipped');
      saveQuestionStatus();
    }
    // Save/restore WebR environment when moving to a different set
    const fromSetKey = `w${state.currentQuestion.week}s${state.currentQuestion.set}`;
    const toSetKey   = `w${q.week}s${q.set}`;
    if (fromSetKey !== toSetKey && state.webrReady) {
      await switchSetEnvironment(state.currentQuestion, q);
    }
  }

  const isFirstSelection = !state.currentQuestion;
  state.currentQuestion = q;
  renderSidebar();
  renderQuestion(q);
  if (window.innerWidth < 768) closeSidebar();

  // First question selected — load its set environment if one was pre-built
  if (isFirstSelection && state.webrReady) {
    const setKey = `w${q.week}s${q.set}`;
    if (state.savedSetEnvs.has(setKey)) {
      try { await state.webR.evalRVoid(`load('/tmp/env_${setKey}.RData')`); } catch { /* ignore */ }
    }
  }

  fireGA4('question_select', { question_id: q.id, week: q.week, set: q.set, client_id: CLIENT_ID });
}

async function switchSetEnvironment(fromQ, toQ) {
  const fromKey = `w${fromQ.week}s${fromQ.set}`;
  const toKey   = `w${toQ.week}s${toQ.set}`;

  // Save current set's environment if any variables exist
  try {
    await state.webR.evalRVoid(
      `if (length(ls(envir = globalenv())) > 0) save(list = ls(envir = globalenv()), file = '/tmp/env_${fromKey}.RData', envir = globalenv())`
    );
    state.savedSetEnvs.add(fromKey);
  } catch { /* ignore */ }

  // Clear global environment
  await state.webR.evalRVoid('rm(list = ls())').catch(() => {});

  // Restore target set's environment if it was previously saved
  if (state.savedSetEnvs.has(toKey)) {
    try {
      await state.webR.evalRVoid(`load('/tmp/env_${toKey}.RData')`);
    } catch { /* ignore */ }
  } else {
    resetEnvironment();
  }
}

function renderQuestion(q) {
  $('welcome-state').classList.add('hidden');
  $('question-view').classList.remove('hidden');

  $('q-badge').textContent    = `W${q.week} · Q${q.id}`;
  const typeBadge = $('q-type');
  typeBadge.textContent = 'R';
  typeBadge.className   = 'q-type-badge r-type';
  $('q-title').textContent  = q.title;
  $('q-scenario').innerHTML = q.scenario || '';
  $('q-task').innerHTML     = q.task;

  // Restore saved editor + output, or initialise fresh for first visit
  restoreEditorState(q.id, q.starter);

  // Refresh environment display
  if (state.webrReady) inspectEnvironment();

  const expectedPanel = $('expected-panel');
  const expectedEl    = $('q-expected');
  if (q.expected) {
    expectedEl.textContent = q.expected;
    expectedPanel.classList.remove('hidden');
  } else {
    expectedEl.textContent = '';
    expectedPanel.classList.add('hidden');
  }

  const solPanel = $('solution-panel');
  solPanel.classList.add('hidden');
  $('solution-code').innerHTML = '';

  const locked = isLocked(q);
  const btn    = $('show-solution-btn');
  btn.classList.toggle('locked', locked);
  if (locked) {
    const d = new Date(q.release_at);
    $('solution-btn-text').textContent = `Unlocks ${d.toLocaleDateString('en-NZ', { weekday:'short', month:'short', day:'numeric' })}`;
  } else {
    $('solution-btn-text').textContent = 'Show Solution';
  }

  const runBtn = $('run-btn');
  runBtn.disabled = !state.webrReady;
  runBtn.title = state.webrReady ? '' : 'Waiting for R engine to load…';

  state.editor?.focus();
}

// ─── Editor State (per-question, in-memory) ───────────────────
function saveEditorState(id) {
  state.questionEditorState[id] = {
    code:       state.editor?.getValue() || '',
    outputHtml: $('console-output').innerHTML,
  };
}

function restoreEditorState(id, starter) {
  const saved = state.questionEditorState[id];
  if (saved) {
    state.editor?.setValue(saved.code);
    $('console-output').innerHTML = saved.outputHtml;
  } else {
    state.editor?.setValue(starter || '# Write your code here\n');
    clearConsole();
  }
}

// ─── Run Code ─────────────────────────────────────────────────
async function runCode() {
  if (!state.webrReady) {
    appendConsole('R engine is still loading — check the status indicator top-right.', 'warn');
    return;
  }
  const code = state.editor?.getValue()?.trim();
  if (!code) return;

  fireGA4('run_code', { question_id: state.currentQuestion?.id ?? 0, week: state.currentQuestion?.week ?? 0, set: state.currentQuestion?.set ?? 0, client_id: CLIENT_ID });

  const btn = $('run-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-sm"></span>Running…';

  clearConsole();

  const shelter = await new state.webR.Shelter();
  try {
    const result = await shelter.captureR(code, {
      withAutoprint: true,
      captureGraphics: { width: 700, height: 480, pointsize: 12, bg: 'white' },
    });
    const stdoutLines = result.output.filter(l => l.type === 'stdout');
    const hasStdout   = stdoutLines.length > 0;
    const hasImages   = result.images && result.images.length > 0;

    if (!result.output.length && !hasImages) {
      appendConsole('(no output)', 'muted');
    } else {
      result.output.forEach(line => {
        if (line.type === 'stdout') appendConsole(line.data, 'stdout');
        else                        appendConsole(line.data, 'stderr');
      });
      if (hasImages) {
        for (const img of result.images) {
          const canvas = document.createElement('canvas');
          canvas.width  = img.width;
          canvas.height = img.height;
          canvas.style.cssText = 'max-width:100%;display:block;margin:8px 0;border-radius:4px;border:1px solid var(--border)';
          canvas.getContext('2d').drawImage(img, 0, 0);
          $('console-output').querySelector('.console-placeholder')?.remove();
          $('console-output').appendChild(canvas);
        }
      }
    }

    if ((hasStdout || hasImages) && state.currentQuestion) {
      state.questionStatus.set(String(state.currentQuestion.id), 'done');
      saveQuestionStatus();
      renderSidebar();
    }

    await inspectEnvironment();
  } catch (err) {
    appendConsole(`Error: ${err.message}`, 'error');
    fireGA4('run_error', { question_id: state.currentQuestion?.id ?? 0, week: state.currentQuestion?.week ?? 0, set: state.currentQuestion?.set ?? 0, error_message: err.message, client_id: CLIENT_ID });
  } finally {
    await shelter.purge();
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>Run';
  }
}

function saveQuestionStatus() {
  localStorage.setItem('questionStatus', JSON.stringify(Object.fromEntries(state.questionStatus)));
}

// ─── Console ──────────────────────────────────────────────────
function clearConsole() {
  $('console-output').innerHTML = '';
}

function appendConsole(text, type = 'stdout') {
  const el = $('console-output');
  el.querySelector('.console-placeholder')?.remove();
  const line = document.createElement('div');
  line.className = `console-line console-${type}`;
  line.textContent = text;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

// ─── Solution ─────────────────────────────────────────────────
function toggleSolution() {
  const q = state.currentQuestion;
  if (!q) return;

  if (isLocked(q)) {
    const d = new Date(q.release_at);
    alert(`Solution unlocks on ${d.toLocaleString('en-NZ')}`);
    return;
  }

  const panel = $('solution-panel');
  const isHidden = panel.classList.contains('hidden');

  if (isHidden) {
    let solution;
    try { solution = b64Decode(q.solution); } catch { solution = q.solution; }

    const container = $('solution-code');
    container.innerHTML = '';

    panel.classList.remove('hidden');
    $('solution-btn-text').textContent = 'Hide Solution';

    const cm = CodeMirror(container, {
      mode: 'r', theme: 'eclipse', lineNumbers: true, readOnly: true, value: solution,
    });
    cm.setSize('100%', 'auto');
    container.classList.add('sol-cm');

    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    fireGA4('view_solution', { question_id: q.id, week: q.week, set: q.set, client_id: CLIENT_ID });
  } else {
    panel.classList.add('hidden');
    $('solution-btn-text').textContent = 'Show Solution';
  }
}

function copySolution() {
  const q = state.currentQuestion;
  if (!q) return;
  try {
    const text = b64Decode(q.solution);
    navigator.clipboard.writeText(text).then(() => {
      const btn = $('copy-solution-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
  } catch { /* ignore */ }
}

// ─── Course Switch ────────────────────────────────────────────
// ─── Sidebar ──────────────────────────────────────────────────
function toggleSidebar() { $('sidebar').classList.contains('open') ? closeSidebar() : openSidebar(); }
function openSidebar()  { $('sidebar').classList.add('open');    $('sidebar-overlay').classList.add('visible'); }
function closeSidebar() { $('sidebar').classList.remove('open'); $('sidebar-overlay').classList.remove('visible'); }

// ─── Environment Inspector ────────────────────────────────────
function resetEnvironment() {
  $('env-content').innerHTML = '<span class="env-placeholder">Run code to inspect variables…</span>';
}

async function inspectEnvironment() {
  if (!state.webrReady) return;
  const shelter = await new state.webR.Shelter();
  try {
    const result = await shelter.captureR(`
      local({
        nms <- ls(envir = globalenv())
        nms <- nms[!startsWith(nms, ".")]
        if (length(nms) == 0) {
          cat("__EMPTY__\\n")
        } else {
          for (nm in nms) {
            x <- tryCatch(get(nm, envir = globalenv()), error = function(e) NULL)
            if (is.null(x)) next
            cl <- paste(class(x), collapse = "/")
            sz <- tryCatch({
              if (is.data.frame(x))      paste0(nrow(x), " x ", ncol(x), " cols")
              else if (!is.null(dim(x))) paste(dim(x), collapse = " x ")
              else                       as.character(length(x))
            }, error = function(e) "?")
            pv <- tryCatch({
              if (is.data.frame(x))     paste0("[", paste(names(x), collapse = ", "), "]")
              else if (is.factor(x))    paste(levels(x)[seq_len(min(5, nlevels(x)))], collapse = ", ")
              else if (length(x) <= 6)  paste(format(x), collapse = " ")
              else                      paste(c(format(head(x, 4)), "..."), collapse = " ")
            }, error = function(e) "—")
            cat(paste0(nm, "\\t", cl, "\\t", sz, "\\t", pv, "\\n"))
          }
        }
      })
    `, { withAutoprint: false });

    const raw = result.output
      .filter(l => l.type === 'stdout')
      .map(l => l.data)
      .join('\n').trim();

    renderEnvironment(raw);
  } catch { /* silently ignore */ } finally {
    await shelter.purge();
  }
}

function renderEnvironment(raw) {
  const container = $('env-content');
  if (!raw || raw === '__EMPTY__') {
    container.innerHTML = '<span class="env-placeholder">No variables in environment</span>';
    return;
  }
  const rows = raw.split('\n').filter(Boolean).map(line => {
    const [name, type, size, ...rest] = line.split('\t');
    return { name: name||'', type: type||'', size: size||'', preview: rest.join('\t') };
  });
  container.innerHTML = `
    <table class="env-table">
      <thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Value</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td class="env-name">${esc(r.name)}</td>
          <td class="env-type">${esc(r.type)}</td>
          <td class="env-size">${esc(r.size)}</td>
          <td class="env-preview" title="${esc(r.preview)}">${esc(r.preview)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function b64Decode(str) {
  try {
    return decodeURIComponent(
      atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
  } catch { return atob(str); }
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── GA4 ──────────────────────────────────────────────────────
function fireGA4(name, params = {}) {
  window.dataLayer = window.dataLayer || [];
  dataLayer.push({ event: name, ...params });
}

// ─── Global key intercept (override Chrome shortcuts) ─────────
window.addEventListener('keydown', e => {
  if (!state.editor?.hasFocus()) return;
  if (e.ctrlKey && e.shiftKey && e.key === 'M') {
    e.preventDefault();
    e.stopImmediatePropagation();
    state.editor.replaceSelection(' %>% ');
  }
}, true);

// ─── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

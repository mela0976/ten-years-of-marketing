#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
AUDIO_DIR="${PROJECT_ROOT}/public/audio"
MAX_SFX_BYTES=20480
MAX_BGM_BYTES=307200

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required to synthesize audio assets" >&2
  exit 1
fi
mkdir -p "${AUDIO_DIR}"

encode_sfx() {
  local output="$1"
  shift
  ffmpeg -y -hide_banner -loglevel error "$@" -ar 44100 -ac 1 -codec:a libmp3lame -b:a 64k "${AUDIO_DIR}/${output}.mp3"
  local bytes
  bytes="$(wc -c < "${AUDIO_DIR}/${output}.mp3" | tr -d '[:space:]')"
  if (( bytes >= MAX_SFX_BYTES )); then
    echo "${output}.mp3 is ${bytes} bytes; expected under ${MAX_SFX_BYTES}" >&2
    exit 1
  fi
  echo "${output}.mp3: ${bytes} bytes"
}

encode_sfx click \
  -f lavfi -i "sine=frequency=1450:duration=0.12" \
  -af "volume=0.24,afade=t=out:st=0.025:d=0.095"

encode_sfx correct \
  -f lavfi -i "sine=frequency=660:duration=0.27" \
  -f lavfi -i "sine=frequency=880:duration=0.18" \
  -filter_complex "[0:a]volume=0.20,afade=t=out:st=0.19:d=0.08[a0];[1:a]adelay=85|85,volume=0.17,afade=t=out:st=0.13:d=0.12[a1];[a0][a1]amix=inputs=2:duration=longest,alimiter=limit=0.88[out]" \
  -map "[out]"

encode_sfx wrong \
  -f lavfi -i "sine=frequency=330:duration=0.30" \
  -f lavfi -i "sine=frequency=220:duration=0.22" \
  -filter_complex "[0:a]volume=0.22,afade=t=out:st=0.20:d=0.10[a0];[1:a]adelay=95|95,volume=0.20,afade=t=out:st=0.14:d=0.10[a1];[a0][a1]amix=inputs=2:duration=longest,alimiter=limit=0.88[out]" \
  -map "[out]"

encode_sfx flip \
  -f lavfi -i "anoisesrc=color=white:sample_rate=44100:duration=0.24" \
  -af "highpass=f=900,lowpass=f=6500,volume=0.18,afade=t=in:st=0:d=0.015,afade=t=out:st=0.14:d=0.10"

ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "sine=frequency=196:sample_rate=44100:duration=20" \
  -f lavfi -i "sine=frequency=246.94:sample_rate=44100:duration=20" \
  -f lavfi -i "sine=frequency=293.66:sample_rate=44100:duration=20" \
  -f lavfi -i "sine=frequency=392:sample_rate=44100:duration=20" \
  -filter_complex "[0:a]volume=0.11[a0];[1:a]volume=0.08[a1];[2:a]volume=0.06[a2];[3:a]volume=0.035[a3];[a0][a1][a2][a3]amix=inputs=4:duration=longest,afade=t=in:st=0:d=0.25,afade=t=out:st=19.75:d=0.25,alimiter=limit=0.8[out]" \
  -map "[out]" -t 20 -ar 44100 -ac 1 -codec:a libmp3lame -b:a 96k "${AUDIO_DIR}/bgm.mp3"

bgm_bytes="$(wc -c < "${AUDIO_DIR}/bgm.mp3" | tr -d '[:space:]')"
if (( bgm_bytes >= MAX_BGM_BYTES )); then
  echo "bgm.mp3 is ${bgm_bytes} bytes; expected under ${MAX_BGM_BYTES}" >&2
  exit 1
fi
echo "bgm.mp3: ${bgm_bytes} bytes (96 kbps mono, 20 seconds)"

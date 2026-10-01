#!/usr/bin/env bash
wait_pid() { while kill -0 "$(cat ~/style-lab/pids/$1)" 2>/dev/null; do sleep 30; done; }
cd /tmp/wt-lab
( wait_pid m-gpt6luna; ~/style-lab/start.sh m-gpt6astra node --import tsx scripts/style-lab/replay.ts /home/agent/style-lab/runs-hold3.json m_gpt6astra /home/agent/style-lab/hold3-m_gpt6astra.jsonl 2 ) &
( wait_pid m-gpt6sol; ~/style-lab/start.sh m-gpt56sol node --import tsx scripts/style-lab/replay.ts /home/agent/style-lab/runs-hold3.json m_gpt56sol /home/agent/style-lab/hold3-m_gpt56sol.jsonl 2 ) &
( wait_pid m-sonnet; ~/style-lab/start.sh m-opus node --import tsx scripts/style-lab/replay.ts /home/agent/style-lab/runs-hold3.json m_opus /home/agent/style-lab/hold3-m_opus.jsonl 2 ) &
wait

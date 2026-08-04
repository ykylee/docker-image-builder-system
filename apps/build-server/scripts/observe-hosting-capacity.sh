#!/usr/bin/env bash
set -euo pipefail

# Convert Kubernetes node allocatable values into build-server admission
# settings. The default 25% reserve covers system pods and burst headroom.
reserve_ratio="${HOSTING_CAPACITY_RESERVE_RATIO:-0.25}"
if ! awk -v value="$reserve_ratio" 'BEGIN { exit !(value >= 0 && value < 1) }'; then
  echo "HOSTING_CAPACITY_RESERVE_RATIO must be >= 0 and < 1" >&2
  exit 1
fi

node_values="$(kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.allocatable.cpu}{" "}{.status.allocatable.memory}{"\n"}{end}')"
if [[ -z "$node_values" ]]; then
  echo "No Kubernetes nodes returned." >&2
  exit 1
fi

read -r cpu_millicores memory_mi < <(
  printf '%s\n' "$node_values" | awk '
    function cpu(value) {
      if (value ~ /m$/) { sub(/m$/, "", value); return value + 0 }
      return (value + 0) * 1000
    }
    function memory(value) {
      if (value ~ /Ki$/) { sub(/Ki$/, "", value); return (value + 0) / 1024 }
      if (value ~ /Mi$/) { sub(/Mi$/, "", value); return value + 0 }
      if (value ~ /Gi$/) { sub(/Gi$/, "", value); return (value + 0) * 1024 }
      return 0
    }
    { cpu_total += cpu($2); memory_total += memory($3) }
    END { printf "%.0f %.0f\n", cpu_total, memory_total }
  '
)

recommended_cpu="$(awk -v value="$cpu_millicores" -v reserve="$reserve_ratio" 'BEGIN { printf "%.0f", value * (1 - reserve) }')"
recommended_memory="$(awk -v value="$memory_mi" -v reserve="$reserve_ratio" 'BEGIN { printf "%.0f", value * (1 - reserve) }')"

echo "# Observed Kubernetes allocatable (reserve=${reserve_ratio})"
echo "export HOSTING_CAPACITY_CPU_MILLICORES=${recommended_cpu}"
echo "export HOSTING_CAPACITY_MEMORY_MI=${recommended_memory}"

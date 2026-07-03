package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	PollInterval      time.Duration
	HostServerBaseURL string
	RunnerID          string
}

func Load() Config {
	return Config{
		PollInterval:      parseDuration("RUNNER_POLL_INTERVAL", 5*time.Second),
		HostServerBaseURL: parseString("HOST_SERVER_BASE_URL", "http://127.0.0.1:3000"),
		RunnerID:          parseString("RUNNER_ID", "runner-default"),
	}
}

func parseString(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func parseDuration(key string, def time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	if d, err := time.ParseDuration(v); err == nil {
		return d
	}
	if n, err := strconv.Atoi(v); err == nil {
		return time.Duration(n) * time.Second
	}
	return def
}

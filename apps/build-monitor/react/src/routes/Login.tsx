// TASK-089: Login 페이지 React 마이그레이션.
//
// Svelte routes/Login.svelte 의 동작과 시각을 1:1 정합:
//   1) mount 시점에 userId 가 이미 있으면 /builds 로 redirect (replace)
//   2) form submit 시 input trim → 비어있지 않으면 userId set + /builds
//   3) 빈/공백 input 은 set 도 navigate 도 하지 않음
//   4) localStorage key = "userId" (USER_ID_KEY 와 정합)
//
// Login.svelte 의 onMount + push("/builds") 와 같은 semantics 를 React
// useEffect + useNavigate 로 옮겼다. useEffect 의존성은 mount-only —
// Svelte onMount 와 1:1 매핑. submit handler 에서 setUserId 후
// navigate 호출하는 경로는 Svelte submit handler 와 정합.
//
// 디자인 토큰은 Login.css 가 @import 로 가져온다. JSX 자체는
// 디자인 토큰을 직접 다루지 않으므로 tokens.css 가 import 되지 않은
// 환경에서는 fallback 값으로 안전하게 degrade.

import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { useUserId } from "@/lib/useUserId";
import "./Login.css";

export function Login(): ReactElement {
  const [userId, setUserId] = useUserId();
  const [input, setInput] = useState<string>("");
  const navigate = useNavigate();

  // 이미 로그인된 상태에서 진입 시 /builds 로 즉시 이동. Svelte 의
  // onMount 와 의미가 같다 — mount 시점의 userId 만 보고 1회 navigate.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (userId !== null) {
      navigate("/builds", { replace: true });
    }
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = input.trim();
    if (value.length > 0) {
      setUserId(value);
      navigate("/builds");
    }
  }

  return (
    <section className="login-page">
      <div className="card">
        <div className="logo-wrapper">
          <span className="logo" aria-hidden="true">⬢</span>
        </div>
        <h1>Welcome to Build Monitor</h1>
        <p className="subtitle">Enter your user ID to view your builds.</p>
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="userId">User ID</label>
            <input
              id="userId"
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
              }}
              placeholder="your-id"
              required
            />
          </div>
          <button type="submit" className="btn-primary">Enter</button>
        </form>
      </div>
    </section>
  );
}
# rules-proposals (onboarding-tutor)

- 제안: catch로 rejected promise를 삼키는 함수를 vitest로 테스트할 때는 `vi.fn` 스텁을 mock 함수로 쓰지 말고 교체 가능한 impl 함수 + 별도 호출 카운터로 스텁한다 (근거: vi.fn은 rejected promise를 mock.results에 붙들어 unhandled rejection으로 감지 → 실제로 catch해 정상 동작하는 코드도 테스트 실패로 승격. vitest 2.1.8. onboardingTranscript.test.ts에서 fetchTranscript/prepareOnboarder의 best-effort throw 삼킴을 검증하려 impl+카운터로 우회한 사례).

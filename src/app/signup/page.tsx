"use client";

// ServerAction (Custom Invocation) を利用した実装
// （ /api/signup のようなAPIエンドポイントを実装する必要がない ）

import React, { useState, useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupRequestSchema, SignupRequest } from "@/app/_types/SignupRequest";
import { TextInputField } from "@/app/_components/TextInputField";
import { ErrorMsgField } from "@/app/_components/ErrorMsgField";
import { Button } from "@/app/_components/Button";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { faSpinner, faPenNib } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import zxcvbn from "zxcvbn";

import { signupServerAction } from "@/app/_actions/signup";

const Page: React.FC = () => {
  const c_Name = "name";
  const c_Email = "email";
  const c_Password = "password";

  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [isSignUpCompleted, setIsSignUpCompleted] = useState(false);

  // パスワード強度用state
  const [passwordStrength, setPasswordStrength] = useState<number | null>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<string>("");

  // フォーム処理関連の準備と設定
  const formMethods = useForm<SignupRequest>({
    mode: "onChange",
    resolver: zodResolver(signupRequestSchema),
  });
  const fieldErrors = formMethods.formState.errors;

  // ルートエラー（サーバサイドで発生した認証エラー）の表示設定の関数
  const setRootError = (errorMsg: string) => {
    formMethods.setError("root", {
      type: "manual",
      message: errorMsg,
    });
  };

  // ルートエラーメッセージのクリアに関する設定
  useEffect(() => {
    const subscription = formMethods.watch((value, { name }) => {
      if (name === c_Email || name === c_Password) {
        formMethods.clearErrors("root");
      }
    });
    return () => subscription.unsubscribe();
  }, [formMethods]);

  // パスワード強度判定
  useEffect(() => {
    const subscription = formMethods.watch((value, { name }) => {
      if (name === c_Password) {
        const pw = value[c_Password] || "";
        if (pw.length > 0) {
          const result = zxcvbn(pw);
          setPasswordStrength(result.score);
          setPasswordFeedback(result.feedback.suggestions.join(" "));
        } else {
          setPasswordStrength(null);
          setPasswordFeedback("");
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [formMethods]);

  // ログイン完了後のリダイレクト処理
  useEffect(() => {
    if (isSignUpCompleted) {
      router.replace(`/login?${c_Email}=${formMethods.getValues(c_Email)}`);
      router.refresh();
      console.log("サインアップ完了");
    }
  }, [formMethods, isSignUpCompleted, router]);

  // フォームの送信処理
  const onSubmit = async (signupRequest: SignupRequest) => {
    try {
      startTransition(async () => {
        // ServerAction (Custom Invocation) の利用
        const res = await signupServerAction(signupRequest);
        if (!res.success) {
          setRootError(res.message);
          return;
        }
        setIsSignUpCompleted(true);
      });
    } catch (e) {
      const errorMsg =
        e instanceof Error ? e.message : "予期せぬエラーが発生しました。";
      setRootError(errorMsg);
    }
  };

  return (
    <main>
      <div className="text-2xl font-bold">
        <FontAwesomeIcon icon={faPenNib} className="mr-1.5" />
        Signup
      </div>
      <form
        noValidate
        onSubmit={formMethods.handleSubmit(onSubmit)}
        className="mt-4 flex flex-col gap-y-4"
      >
        <div>
          <label htmlFor={c_Name} className="mb-2 block font-bold">
            表示名
          </label>
          <TextInputField
            {...formMethods.register(c_Name)}
            id={c_Name}
            placeholder="寝屋川 タヌキ"
            type="text"
            disabled={isPending || isSignUpCompleted}
            error={!!fieldErrors.name}
            autoComplete="name"
          />
          <ErrorMsgField msg={fieldErrors.name?.message} />
        </div>

        <div>
          <label htmlFor={c_Email} className="mb-2 block font-bold">
            メールアドレス（ログインID）
          </label>
          <TextInputField
            {...formMethods.register(c_Email)}
            id={c_Email}
            placeholder="name@example.com"
            type="email"
            disabled={isPending || isSignUpCompleted}
            error={!!fieldErrors.email}
            autoComplete="email"
          />
          <ErrorMsgField msg={fieldErrors.email?.message} />
        </div>

        <div>
          <label htmlFor={c_Password} className="mb-2 block font-bold">
            パスワード
          </label>
          <TextInputField
            {...formMethods.register(c_Password)}
            id={c_Password}
            placeholder="*****"
            type="password"
            disabled={isPending || isSignUpCompleted}
            error={!!fieldErrors.password}
            autoComplete="off"
          />
          {/* パスワード強度表示 */}
          {passwordStrength !== null && (
            <div className="mt-1 text-sm">
              <span>強度: </span>
              <span className={
                passwordStrength <= 1
                  ? "text-red-500"
                  : passwordStrength === 2
                  ? "text-yellow-500"
                  : passwordStrength === 3
                  ? "text-blue-500"
                  : "text-green-600"
              }>
                {['とても弱い', '弱い', '普通', '強い', 'とても強い'][passwordStrength]}
              </span>
              {passwordFeedback && (
                <div className="text-xs text-gray-500">{passwordFeedback}</div>
              )}
            </div>
          )}
          <ErrorMsgField msg={fieldErrors.password?.message} />
          <ErrorMsgField msg={fieldErrors.root?.message} />
        </div>

        <Button
          variant="indigo"
          width="stretch"
          className="tracking-widest"
          disabled={
            !formMethods.formState.isValid ||
            formMethods.formState.isSubmitting ||
            isSignUpCompleted
          }
        >
          登録
        </Button>
      </form>

      {isSignUpCompleted && (
        <div>
          <div className="mt-4 flex items-center gap-x-2">
            <FontAwesomeIcon icon={faSpinner} spin />
            <div>サインアップが完了しました。ログインページに移動します。</div>
          </div>
          <NextLink
            href={`/login?${c_Email}=${formMethods.getValues(c_Email)}`}
            className="text-blue-500 hover:underline"
          >
            自動的に画面が切り替わらないときはこちらをクリックしてください。
          </NextLink>
        </div>
      )}
    </main>
  );
};

export default Page;

import { prisma } from "@/libs/prisma";
import { loginRequestSchema } from "@/app/_types/LoginRequest";
import { userProfileSchema } from "@/app/_types/UserProfile";
import type { UserProfile } from "@/app/_types/UserProfile";
import type { ApiResponse } from "@/app/_types/ApiResponse";
import { NextResponse, NextRequest } from "next/server";
import { createSession } from "@/app/api/_helper/createSession";
import { createJwt } from "@/app/api/_helper/createJwt";
import { AUTH } from "@/config/auth";
import bcrypt from "bcrypt";

// キャッシュを無効化して毎回最新情報を取得
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export const POST = async (req: NextRequest) => {
  try {
    const result = loginRequestSchema.safeParse(await req.json());
    if (!result.success) {
      const res: ApiResponse<null> = {
        success: false,
        payload: null,
        message: "リクエストボディの形式が不正です。",
      };
      return NextResponse.json(res);
    }
    const loginRequest = result.data;

    const user = await prisma.user.findUnique({
      where: { email: loginRequest.email },
    });
    if (!user) {
      // 💀 このアカウント（メールアドレス）の有効無効が分かってしまう。
      const res: ApiResponse<null> = {
        success: false,
        payload: null,
        message: "このメールアドレスは登録されていません。",
        // message: "メールアドレスまたはパスワードの組み合わせが正しくありません。",
      };
      return NextResponse.json(res);
    }

    // パスワードの検証
    const isValidPassword = await bcrypt.compare(loginRequest.password, user.password);
    if (!isValidPassword) {
      const res: ApiResponse<null> = {
        success: false,
        payload: null,
        message:
          "メールアドレスまたはパスワードの組み合わせが正しくありません。",
      };
      return NextResponse.json(res);
    }

    const tokenMaxAgeSeconds = 60 * 60 * 3; // 3時間

    if (AUTH.isSession) {
      // ■■ セッションベース認証の処理 ■■
      await createSession(user.id, tokenMaxAgeSeconds);
      const res: ApiResponse<UserProfile> = {
        success: true,
        payload: userProfileSchema.parse(user), // 余分なプロパティを削除
        message: "",
      };
      return NextResponse.json(res);
    } else {
      // ■■ トークンベース認証の処理 ■■
      const jwt = await createJwt(user, tokenMaxAgeSeconds);
      const res: ApiResponse<string> = {
        success: true,
        payload: jwt,
        message: "",
      };
      return NextResponse.json(res);
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Internal Server Error";
    console.error(errorMsg);
    const res: ApiResponse<null> = {
      success: false,
      payload: null,
      message: "ログインのサーバサイドの処理に失敗しました。",
    };
    return NextResponse.json(res);
  }
};

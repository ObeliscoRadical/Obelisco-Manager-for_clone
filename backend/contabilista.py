"""
Módulo Contabilista IA.
Cálculos fiscais portugueses 2026 + chat IA (Gemini) para dúvidas de contabilidade.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import os
import uuid
import logging

from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)

contabilista_router = APIRouter(prefix="/api/contabilista", tags=["contabilista"])


# ============================================================
# Sistema fiscal PT 2026 (valores oficiais + aproximações)
# ============================================================
SYSTEM_PROMPT = """És o "Contabilista IA da Obelisco Radical", um assistente especializado em contabilidade e fiscalidade portuguesa (2026).

CONTEXTO:
- Empresa: Obelisco Radical, LDA — serviços de eletricidade e telecomunicações em Lisboa
- Regime: IRC standard, IVA 23% (regra geral), pode faturar taxa reduzida 6% em habitações (RITI)
- Tem funcionários com contrato de trabalho + alguns subcontratados a recibo verde

REGRAS QUE DEVES SEGUIR:
1. Responde SEMPRE em português europeu, tom profissional mas acessível
2. Usa valores fiscais PT 2026: TSU patronal 23.75%, TSU trabalhador 11%, TSU independentes 21.4%, IVA 23%, IRC 21% (17% até 25k€), Derrama municipal Lisboa 1.5%
3. Cita SEMPRE o artigo/legislação quando aplicável (CIRS, CIRC, CIVA, Código do Trabalho)
4. Se a pergunta envolve cálculo, mostra a FÓRMULA usada
5. Se a pergunta é ambígua ou depende de detalhes, pede clarificação em vez de assumir
6. NUNCA dês conselhos que possam violar a lei fiscal portuguesa
7. Termina sempre respostas complexas com: "Confirme com o seu TOC/Contabilista Certificado antes de decidir."
8. Sê CONCISO — máximo 400 palavras salvo pergunta muito específica

Se te perguntarem sobre algo fora de contabilidade/fiscalidade PT, redireciona educadamente.
"""


class ChatMessage(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str


class ChatRequest(BaseModel):
    session_id: str
    message: str
    history: List[ChatMessage] = []


class SavedChatSession(BaseModel):
    title: str


def create_contabilista_router(db, get_current_user):

    @contabilista_router.post("/chat")
    async def chat(input: ChatRequest, user=Depends(get_current_user)):
        """Chat com contabilista IA (Gemini). Não streaming — resposta única."""
        api_key = os.environ.get("EMERGENT_LLM_KEY", "")
        if not api_key:
            raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY não configurada")

        try:
            chat_instance = LlmChat(
                api_key=api_key,
                session_id=input.session_id or f"contabilista-{uuid.uuid4().hex[:8]}",
                system_message=SYSTEM_PROMPT,
            ).with_model("gemini", "gemini-3.1-pro-preview")

            # Constrói contexto de histórico (se houver)
            context_prefix = ""
            if input.history:
                context_prefix = "Histórico da conversa:\n"
                for m in input.history[-6:]:  # últimas 6 mensagens
                    role_pt = "Utilizador" if m.role == "user" else "Assistente"
                    context_prefix += f"{role_pt}: {m.content}\n"
                context_prefix += "\nNova pergunta:\n"

            full_message = context_prefix + input.message
            response = await chat_instance.send_message(UserMessage(text=full_message))

            # Guardar histórico em DB (opcional, para futura consulta)
            await db.contabilista_chats.insert_one({
                "session_id": input.session_id,
                "user_id": user.get("id"),
                "message": input.message,
                "response": response,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

            return {"response": response, "session_id": input.session_id}

        except Exception as e:
            logger.error(f"Chat contabilista falhou: {e}")
            raise HTTPException(status_code=500, detail=f"IA indisponível: {str(e)[:200]}")

    @contabilista_router.get("/history/{session_id}")
    async def get_history(session_id: str, user=Depends(get_current_user)):
        """Retorna histórico de uma sessão."""
        msgs = await db.contabilista_chats.find(
            {"session_id": session_id, "user_id": user.get("id")},
            {"_id": 0}
        ).sort("created_at", 1).to_list(100)
        return {"messages": msgs}

    return contabilista_router

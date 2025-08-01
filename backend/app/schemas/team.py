from pydantic import BaseModel

class TeamBase(BaseModel):
    name: str
    description: str

class TeamCreate(TeamBase):
    pass

class TeamUpdate(TeamBase):
    pass

class TeamResponse(TeamBase):
    id: int
    class Config:
        orm_mode = True

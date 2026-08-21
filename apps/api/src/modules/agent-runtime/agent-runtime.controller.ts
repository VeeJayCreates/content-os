import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AgentRuntimeService } from './agent-runtime.service';
import { AppendAgentActivityDto } from './dto/append-agent-activity.dto';
import { CreateAgentRunDto } from './dto/create-agent-run.dto';
import { ListAgentRunsDto } from './dto/list-agent-runs.dto';
import { UpdateAgentStateDto } from './dto/update-agent-state.dto';

@Controller('agent-runs')
export class AgentRuntimeController {
  constructor(private readonly service: AgentRuntimeService) {}
  @Post() create(@Body() dto: CreateAgentRunDto) { return this.service.create(dto); }
  @Get('office') office(@Query('agentKeys') agentKeys?: string) {
    const keys = agentKeys?.split(',').map((key) => key.trim()).filter(Boolean) ?? [];
    return this.service.office(keys);
  }
  @Get() list(@Query() query: ListAgentRunsDto) { return this.service.list(query); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Patch(':id/state') updateState(@Param('id') id: string, @Body() dto: UpdateAgentStateDto) { return this.service.updateState(id, dto.state); }
  @Post(':id/activities') appendActivity(@Param('id') id: string, @Body() dto: AppendAgentActivityDto) { return this.service.appendActivity(id, dto); }
}

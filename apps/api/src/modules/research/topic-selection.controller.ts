import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { EvaluateTopicSelectionsDto } from "./dto/evaluate-topic-selections.dto";
import { ListTopicSelectionsDto } from "./dto/list-topic-selections.dto";
import { TopicSelectionService } from "./topic-selection.service";
@Controller("topic-selections") export class TopicSelectionController { constructor(private readonly service: TopicSelectionService) {} @Post("evaluate") evaluate(@Body() dto: EvaluateTopicSelectionsDto) { return this.service.evaluate(dto.projectId, dto.opportunityId); } @Get() findAll(@Query() query: ListTopicSelectionsDto) { return this.service.findAll(query.projectId); } @Get(":id") findOne(@Param("id", new ParseUUIDPipe()) id: string) { return this.service.findOne(id); } }
